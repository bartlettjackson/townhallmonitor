"""Scraper for California Senate sites (sd*.senate.ca.gov).

Senate sites are Drupal-based. Event content often appears under
/events, /calendar, or /town-hall paths. The markup uses Drupal's
views system with .views-row containers and field-based layouts.
"""

import logging

from bs4 import BeautifulSoup, Tag

from app.scraper.base import BaseScraper
from app.scraper.event_data import EventData
from app.scraper.filters import is_constituent_event

logger = logging.getLogger(__name__)


class SenateScraper(BaseScraper):
    name = "senate"

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

        logger.info("SenateScraper found %d constituent events at %s", len(events), url)
        return events

    def _find_event_containers(self, soup: BeautifulSoup) -> list[Tag]:
        for selector in [
            ".view-content .views-row",
            ".view-events .views-row",
            ".node--type-event",
            "article.node-event",
            ".event-listing .event",
            ".field-content article",
            ".view-content article",
            ".calendar-list .calendar-item",
        ]:
            found = soup.select(selector)
            if found:
                return found
        return []

    def _parse_container(self, el: Tag, url: str) -> EventData | None:
        # Title — Drupal views often use .field-content or .views-field-title
        title_el = el.select_one(
            ".views-field-title a, "
            ".views-field-title .field-content, "
            "h2 a, h3 a, h2, h3, "
            ".field--name-title, "
            ".event-title"
        )
        if not title_el:
            return None
        title = title_el.get_text(strip=True)
        if not title:
            return None

        # Date — Drupal date fields
        date_el = el.select_one(
            ".views-field-field-date .field-content, "
            ".date-display-single, "
            ".views-field-field-event-date .field-content, "
            "time, .date, "
            ".field--name-field-date"
        )
        date = date_el.get_text(strip=True) if date_el else None

        time_el = el.select_one(".views-field-field-time .field-content, .time, .event-time")
        time_str = time_el.get_text(strip=True) if time_el else None

        # Location
        loc_el = el.select_one(
            ".views-field-field-location .field-content, "
            ".views-field-field-address .field-content, "
            ".field--name-field-location, "
            "address, .location, .event-location"
        )
        address = loc_el.get_text(" ", strip=True) if loc_el else None

        # Description
        desc_el = el.select_one(
            ".views-field-body .field-content, "
            ".field--name-body, "
            ".views-field-field-description .field-content, "
            ".event-description, p"
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
