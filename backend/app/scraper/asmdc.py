"""Scraper for Assembly Democrat sites (*.asmdc.org).

These sites are typically WordPress-based with event listings under /events
or /town-halls. Common structures include:
- .tribe-events-list (The Events Calendar plugin)
- .type-tribe_events article elements
- Generic .event-item / .views-row containers
"""

import logging

from bs4 import BeautifulSoup, Tag

from app.scraper.base import BaseScraper
from app.scraper.event_data import EventData
from app.scraper.filters import is_constituent_event

logger = logging.getLogger(__name__)


class AsmDcScraper(BaseScraper):
    name = "asmdc"

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
