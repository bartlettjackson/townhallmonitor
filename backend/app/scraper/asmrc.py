"""Scraper for Assembly Republican sites (*.asmrc.org).

Republican caucus sites use a different CMS than the Democrat sites.
Event listings often appear under /events or /calendar with simpler
HTML structures — typically <article> or <div> wrappers with headings
and paragraph text for details.
"""

import logging
import re

from bs4 import BeautifulSoup, Tag

from app.scraper.base import BaseScraper
from app.scraper.event_data import EventData
from app.scraper.filters import is_constituent_event

logger = logging.getLogger(__name__)


class AsmRcScraper(BaseScraper):
    name = "asmrc"

    async def extract_events(self, html: str, url: str) -> list[EventData]:
        soup = BeautifulSoup(html, "html.parser")
        events: list[EventData] = []

        containers = self._find_event_containers(soup)
        if not containers:
            return events

        for el in containers:
            parsed = self._parse_container(el, url)
            if parsed and is_constituent_event(parsed.title, parsed.additional_details):
                events.append(parsed)

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
