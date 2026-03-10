"""Scraper for Assembly Republican sites (*.asmrc.org).

Republican caucus sites use a different CMS than the Democrat sites.
Event listings often appear under /events or /calendar with simpler
HTML structures — typically <article> or <div> wrappers with headings
and paragraph text for details.
"""

import logging
import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from app.scraper.base import BaseScraper
from app.scraper.event_data import EventData
from app.scraper.filters import is_constituent_event
from app.scraper.time_utils import extract_start_time

logger = logging.getLogger(__name__)

_ADDR_RE = re.compile(r"\d+\s+[\w\s.]+(?:St|Ave|Blvd|Dr|Rd|Way|Ln|Ct|Pl|Hwy)\.?")
_ZIP_RE = re.compile(r"[A-Z][a-z]+,?\s+CA\s+\d{5}")


class AsmRcScraper(BaseScraper):
    name = "asmrc"

    async def extract_events(self, html: str, url: str) -> list[EventData]:
        soup = BeautifulSoup(html, "html.parser")
        events: list[EventData] = []
        detail_hrefs: list[str | None] = []

        containers = self._find_event_containers(soup)
        if not containers:
            return events

        for el in containers:
            parsed = self._parse_container(el, url)
            if parsed and is_constituent_event(parsed.title, parsed.additional_details):
                events.append(parsed)
                link = el.select_one("a[href*='/event/']")
                href = urljoin(url, link["href"]) if link and link.get("href") else None
                detail_hrefs.append(href)

        # Enrich events missing time/address from detail pages
        for ev, href in zip(events, detail_hrefs):
            if href and (not ev.time or not ev.address):
                await self._enrich_from_detail(ev, href)

        logger.info("AsmRcScraper found %d constituent events at %s", len(events), url)
        return events

    def _find_event_containers(self, soup: BeautifulSoup) -> list[Tag]:
        for selector in [
            ".event-listing .event-item",
            ".news-list article",
            "article.event",
            ".event-card",
            ".views-row",
            ".content-area article",
            ".entry-content .event",
        ]:
            found = soup.select(selector)
            if found:
                return found
        return []

    def _parse_container(self, el: Tag, url: str) -> EventData | None:
        title_el = el.select_one("h2 a, h3 a, h2, h3, h4, .event-title, .title")
        if not title_el:
            return None
        title = title_el.get_text(strip=True)
        if not title:
            return None

        date_el = el.select_one("time, .date, .event-date, .post-date")
        date = date_el.get_text(strip=True) if date_el else None

        if not date:
            date = self._date_from_url(el)

        time_el = el.select_one(".time, .event-time")
        time_str = time_el.get_text(strip=True) if time_el else None

        # Try extracting time from the full element text if no dedicated element
        if not time_str:
            time_str = extract_start_time(el.get_text())

        loc_el = el.select_one("address, .location, .event-location, .venue")
        address = loc_el.get_text(" ", strip=True) if loc_el else None

        desc_el = el.select_one(".event-description, .description, .excerpt, .entry-summary, p")
        details = desc_el.get_text(strip=True) if desc_el else None

        return EventData(
            title=title,
            date=date,
            time=time_str,
            address=address,
            event_type="town_hall",
            additional_details=details,
            source_url=url,
            is_virtual=self._detect_virtual(el.get_text()),
            raw_html_snippet=self._snippet(el),
        )

    async def _enrich_from_detail(self, ev: EventData, detail_url: str):
        """Fetch an event detail page and extract time/address from the body."""
        html = await self.fetch_page(detail_url)
        if not html:
            return

        soup = BeautifulSoup(html, "html.parser")
        lines = self._extract_body_lines(soup)
        if not lines:
            return

        if not ev.time:
            for line in lines:
                t = extract_start_time(line)
                if t:
                    ev.time = t
                    break

        if not ev.address:
            ev.address = self._extract_address(lines)

        if not ev.additional_details and lines:
            ev.additional_details = lines[0]

    @staticmethod
    def _extract_body_lines(soup: BeautifulSoup) -> list[str]:
        """Get text lines from the main event body on a detail page."""
        # Try common content containers
        for selector in [
            ".field--name-body",
            ".entry-content",
            ".event-content",
            ".content-area",
            "article .content",
            ".post-content",
            "main",
        ]:
            for body_el in soup.select(selector):
                paragraphs = body_el.select("p")
                if not paragraphs:
                    continue
                lines = [p.get_text(strip=True) for p in paragraphs if p.get_text(strip=True)]
                text = " ".join(lines)
                if len(text) < 30 or len(text) > 5000:
                    continue
                if _ADDR_RE.search(text) or _ZIP_RE.search(text):
                    return lines
                if len(lines) >= 2:
                    return lines
        return []

    @staticmethod
    def _extract_address(lines: list[str]) -> str | None:
        addr_parts = []
        collecting = False
        for line in lines:
            if _ADDR_RE.search(line):
                collecting = True
                addr_parts.append(line)
            elif collecting and _ZIP_RE.search(line):
                addr_parts.append(line)
                break
            elif collecting:
                break
        return ", ".join(addr_parts) if addr_parts else None

    @staticmethod
    def _date_from_url(el: Tag) -> str | None:
        """Extract YYYY-MM-DD from an event link like /event/20260411-slug."""
        link = el.select_one("a[href*='/event/']")
        if not link:
            return None
        href = link.get("href", "")
        m = re.search(r"/event/(\d{4})(\d{2})(\d{2})-", href)
        if m:
            return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
        return None
