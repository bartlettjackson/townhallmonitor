"""ScraperOrchestrator — coordinates scraping for a single legislator.

Full pipeline:
1. Pattern scraper (URL-matched: asmdc / asmrc / senate)
2. Campaign site scraper (WordPress)
3. AI parser (Claude) on any HTML we already fetched
4. Mark as failed if nothing works
"""

import logging
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event
from app.models.legislator import Legislator
from app.models.scrape_log import ScrapeLog
from app.scraper.event_data import EventData
from app.scraper.registry import get_scraper_for_url
from app.scraper.wordpress import WordPressScraper

logger = logging.getLogger(__name__)

CIRCUIT_BREAKER_THRESHOLD = 5
CIRCUIT_BREAKER_COOLDOWN_HOURS = 24


class ScrapeResult:
    __slots__ = ("events", "method", "error", "ai_cost")

    def __init__(
        self,
        events: list[EventData] | None = None,
        method: str = "pattern",
        error: str | None = None,
        ai_cost: dict | None = None,
    ):
        self.events = events or []
        self.method = method
        self.error = error
        self.ai_cost = ai_cost


class ScraperOrchestrator:
    async def scrape_legislator(
        self,
        legislator: Legislator,
        session: AsyncSession,
    ) -> ScrapeResult:
        now = datetime.utcnow()

        # Circuit breaker: skip if too many consecutive failures
        if (
            legislator.consecutive_failures >= CIRCUIT_BREAKER_THRESHOLD
            and legislator.circuit_open_until
            and legislator.circuit_open_until > now
        ):
            logger.info(
                "Circuit breaker open for %s (%d failures, open until %s)",
                legislator.name,
                legislator.consecutive_failures,
                legislator.circuit_open_until,
            )
            log = ScrapeLog(
                legislator_id=legislator.id,
                started_at=now,
                completed_at=now,
                status="skipped",
                error_message=(
                    f"Circuit breaker open: {legislator.consecutive_failures} consecutive failures"
                ),
            )
            session.add(log)
            legislator.last_scraped_at = now
            legislator.scrape_status = "skipped"
            await session.commit()
            return ScrapeResult(error="circuit_breaker_open")

        log = ScrapeLog(
            legislator_id=legislator.id,
            started_at=now,
            status="failed",
        )

        try:
            result = await self._try_scrape(legislator)

            if result.error:
                log.status = "failed"
                log.error_message = result.error
                log.method_used = result.method
            elif result.events:
                log.status = "success"
                log.method_used = result.method
                await self._save_events(result.events, legislator.id, session)
            else:
                log.status = "no_events"
                log.method_used = result.method

        except Exception as exc:
            logger.exception("Unexpected error scraping legislator %s", legislator.name)
            log.status = "failed"
            log.error_message = str(exc)[:1000]
            result = ScrapeResult(error=str(exc))

        # Finalise log and legislator
        log.completed_at = datetime.utcnow()
        session.add(log)

        legislator.last_scraped_at = log.completed_at
        legislator.scrape_status = log.status

        # Update circuit breaker state
        if log.status == "failed":
            legislator.consecutive_failures = (legislator.consecutive_failures or 0) + 1
            if legislator.consecutive_failures >= CIRCUIT_BREAKER_THRESHOLD:
                legislator.circuit_open_until = datetime.utcnow() + timedelta(
                    hours=CIRCUIT_BREAKER_COOLDOWN_HOURS
                )
        else:
            # success or no_events — reset circuit breaker
            legislator.consecutive_failures = 0
            legislator.circuit_open_until = None

        await session.commit()
        return result

    async def _try_scrape(self, legislator: Legislator) -> ScrapeResult:
        """Pipeline: pattern scraper → campaign site → AI parser → failed."""

        if not (legislator.official_website or legislator.campaign_website):
            return ScrapeResult(error="No website URLs configured")

        # Collect fetched HTML for potential AI fallback.
        # Each entry: (url, html)
        fetched_pages: list[tuple[str, str]] = []
        redirect_info: str | None = None

        # -- Step 1: pattern scraper on official site --------------------------
        if legislator.official_website:
            scraper = get_scraper_for_url(legislator.official_website)
            try:
                events, pages, redir = await self._run_scraper_collecting_html(
                    scraper, legislator.official_website
                )
                fetched_pages.extend(pages)
                if redir:
                    redirect_info = (
                        f"Official site redirected: {legislator.official_website} → {redir}"
                    )
                if events:
                    return ScrapeResult(events=events, method="pattern")
            except Exception as exc:
                logger.warning(
                    "Official site scraper (%s) failed for %s: %s",
                    scraper.name,
                    legislator.name,
                    exc,
                )
            finally:
                await scraper.close()

        # -- Step 2: WordPress scraper on campaign site ------------------------
        if legislator.campaign_website:
            scraper = WordPressScraper()
            try:
                events, pages, redir = await self._run_scraper_collecting_html(
                    scraper, legislator.campaign_website
                )
                fetched_pages.extend(pages)
                if redir and not redirect_info:
                    redirect_info = (
                        f"Campaign site redirected: {legislator.campaign_website} → {redir}"
                    )
                if events:
                    return ScrapeResult(events=events, method="pattern")
            except Exception as exc:
                logger.warning(
                    "Campaign site scraper failed for %s: %s",
                    legislator.name,
                    exc,
                )
            finally:
                await scraper.close()

        # -- Step 3: AI parser on collected HTML -------------------------------
        if fetched_pages:
            ai_result = await self._try_ai_parse(fetched_pages, legislator.name)
            if ai_result is not None:
                return ai_result

        # -- Step 4: nothing worked --------------------------------------------
        error_msg = None
        if redirect_info:
            error_msg = f"No events found. {redirect_info}"
        return ScrapeResult(method="pattern", error=error_msg)

    async def _run_scraper_collecting_html(self, scraper, base_url):
        """Run a scraper and also collect the raw HTML it fetched.

        Returns (events, [(url, html), ...], redirect_url_or_None).
        """
        from app.scraper.base import EVENT_PATHS

        events: list[EventData] = []
        pages: list[tuple[str, str]] = []
        redirect_url: str | None = None
        base = base_url.rstrip("/")

        for path in EVENT_PATHS:
            url = f"{base}{path}"
            html = await scraper.fetch_page(url)

            # Check for domain-level redirect
            redir = scraper.check_url_redirect(url)
            if redir and redirect_url is None:
                redirect_url = redir

            if html is None:
                continue
            pages.append((url, html))
            extracted = await scraper.extract_events(html, url)
            if extracted:
                events.extend(extracted)
                break

        return events, pages, redirect_url

    async def _try_ai_parse(
        self, fetched_pages: list[tuple[str, str]], legislator_name: str
    ) -> ScrapeResult | None:
        """Attempt AI parsing on the best fetched page."""
        from app.scraper.ai_parser import AIParser

        try:
            parser = AIParser()
        except RuntimeError:
            logger.info("AI parser unavailable (no API key), skipping for %s", legislator_name)
            return None

        # Pick the page with the most content (likely the real events page)
        best_url, best_html = max(fetched_pages, key=lambda p: len(p[1]))

        logger.info("Running AI parser on %s for %s", best_url, legislator_name)
        try:
            events = await parser.parse_events(best_html, best_url)
        except Exception as exc:
            logger.error("AI parser failed for %s: %s", legislator_name, exc)
            return ScrapeResult(method="ai", error=f"AI parse error: {exc}")

        cost = parser.get_cost_estimate()

        if events:
            return ScrapeResult(events=events, method="ai", ai_cost=cost)

        # AI ran but found nothing — that's a definitive "no events"
        return ScrapeResult(method="ai", ai_cost=cost)

    async def _save_events(
        self,
        event_data_list: list[EventData],
        legislator_id: int,
        session: AsyncSession,
    ):
        from sqlalchemy import select

        for ed in event_data_list:
            # Upsert: match on legislator + title + date to avoid duplicates
            stmt = select(Event).where(
                Event.legislator_id == legislator_id,
                Event.title == ed.title,
                Event.date == ed.date,
            )
            existing = (await session.execute(stmt)).scalar_one_or_none()

            if existing:
                existing.time = ed.time
                existing.address = ed.address
                existing.event_type = ed.event_type
                existing.additional_details = ed.additional_details
                existing.source_url = ed.source_url
                existing.is_virtual = ed.is_virtual
                existing.raw_html_snippet = ed.raw_html_snippet
            else:
                session.add(
                    Event(
                        legislator_id=legislator_id,
                        title=ed.title,
                        date=ed.date,
                        time=ed.time,
                        address=ed.address,
                        event_type=ed.event_type,
                        additional_details=ed.additional_details,
                        source_url=ed.source_url,
                        is_virtual=ed.is_virtual,
                        raw_html_snippet=ed.raw_html_snippet,
                    )
                )
