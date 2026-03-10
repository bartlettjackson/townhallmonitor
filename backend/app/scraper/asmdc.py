"""Scraper for Assembly Democrat sites (*.asmdc.org).

These sites are typically WordPress-based with event listings under /events
or /town-halls. Common structures include:
- .tribe-events-list (The Events Calendar plugin)
- .type-tribe_events article elements
- Generic .event-item / .views-row containers
"""

import logging
import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from app.scraper.base import BaseScraper
from app.scraper.event_data import EventData
from app.scraper.filters import is_constituent_event
from app.scraper.time_utils import _TIME_RE, extract_start_time

logger = logging.getLogger(__name__)


# Regex for CA addresses like "404 N 6th St." or "3031 Torrance Blvd."
_ADDR_RE = re.compile(r"(\d+\s+[\w\s.]+(?:St|Ave|Blvd|Dr|Rd|Way|Ln|Ct|Pl|Hwy)\.?)")
_ZIP_RE = re.compile(r"[A-Z][a-z]+,?\s+CA\s+\d{5}")


class AsmDcScraper(BaseScraper):
    name = "asmdc"

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

        logger.info("AsmDcScraper found %d constituent events at %s", len(events), url)
        return events

    def _find_event_containers(self, soup: BeautifulSoup) -> list[Tag]:
        # Try selectors in order of specificity
        for selector in [
            ".tribe-events-list .tribe-events-list-event",
            "article.tribe_events",
            "article.type-tribe_events",
            ".event-item",
            ".views-row",
            ".entry-content article",
            ".events-list .event",
        ]:
            found = soup.select(selector)
            if found:
                return found
        return []

    def _parse_container(self, el: Tag, url: str) -> EventData | None:
        # Title
        title_el = el.select_one(
            ".tribe-events-list-event-title a, "
            ".tribe-events-list-event-title, "
            "h2.tribe-events-single-event-title, "
            "h2 a, h3 a, h2, h3, h4, "
            ".event-title"
        )
        if not title_el:
            return None
        title = title_el.get_text(strip=True)
        if not title:
            return None

        # Date
        date_el = el.select_one(
            ".tribe-event-schedule-details, "
            ".tribe-event-date-start, "
            "time, .date, .event-date, "
            ".tribe-events-schedule"
        )
        date = date_el.get_text(strip=True) if date_el else None

        # Fallback: extract date from event URL path like /event/20260411-slug
        if not date:
            date = self._date_from_url(el)

        # Time (sometimes embedded in date string for tribe events)
        time_el = el.select_one(".tribe-event-time, .time, .event-time")
        time_str = time_el.get_text(strip=True) if time_el else None

        # Location / address
        loc_el = el.select_one(
            ".tribe-venue, .tribe-venue-location, "
            ".tribe-events-venue-details, "
            "address, .location, .event-location, .event-venue"
        )
        address = loc_el.get_text(" ", strip=True) if loc_el else None

        # Description
        desc_el = el.select_one(
            ".tribe-events-list-event-description, "
            ".tribe-events-content, "
            ".event-description, .description, "
            ".entry-summary, .event-details"
        )
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
        """Get text lines from the main event body on a detail page.

        ASMDC detail pages have multiple .field--name-body blocks (event
        content, office info, footer). We want the one with event content,
        which is typically the longest one that contains a date/time or
        address.  Content lives in direct <p> children, not .field__item.
        """
        best_lines: list[str] = []
        for body_el in soup.select(".field--name-body"):
            paragraphs = body_el.select("p")
            if not paragraphs:
                continue
            lines = [p.get_text(strip=True) for p in paragraphs if p.get_text(strip=True)]
            text = " ".join(lines)
            if len(text) < 50 or len(text) > 5000:
                continue
            # Prefer the body block that contains an address or time pattern
            if _ADDR_RE.search(text) or _TIME_RE.search(text):
                return lines
            if len(lines) > len(best_lines):
                best_lines = lines
        return best_lines

    @staticmethod
    def _extract_address(lines: list[str]) -> str | None:
        """Build an address from consecutive lines containing street/city info."""
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
                # Next non-address line — stop
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
