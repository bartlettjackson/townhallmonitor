"""Generic WordPress event scraper.

Handles the two most common WP event plugins:
- The Events Calendar (Tribe Events) — uses .tribe-events-* classes
- Events Manager — uses .event, .event-list, #em-events-* patterns

Falls back to generic article/entry-based extraction if neither
plugin signature is detected.
"""

import logging

from bs4 import BeautifulSoup, Tag

from app.scraper.base import BaseScraper
from app.scraper.event_data import EventData
from app.scraper.filters import is_constituent_event

logger = logging.getLogger(__name__)


class WordPressScraper(BaseScraper):
    name = "wordpress"

    async def extract_events(self, html: str, url: str) -> list[EventData]:
        soup = BeautifulSoup(html, "html.parser")
        events: list[EventData] = []

        # Detect which plugin/pattern is in use
        if soup.select(".tribe-events-list, .tribe-events-calendar, .tribe-common"):
            containers = self._tribe_containers(soup)
            parse_fn = self._parse_tribe
        elif soup.select(".em-events-list, #em-events, .event-list"):
            containers = self._em_containers(soup)
            parse_fn = self._parse_em
        else:
            containers = self._generic_containers(soup)
            parse_fn = self._parse_generic

        for el in containers:
            parsed = parse_fn(el, url)
            if parsed and is_constituent_event(parsed.title, parsed.additional_details):
                events.append(parsed)

        logger.info("WordPressScraper found %d constituent events at %s", len(events), url)
        return events

    # -- The Events Calendar (Tribe) -------------------------------------------

    def _tribe_containers(self, soup: BeautifulSoup) -> list[Tag]:
        return (
            soup.select(".tribe-events-list .tribe-events-list-event")
            or soup.select("article.tribe_events")
            or soup.select(".tribe-common-g-row")
            or []
        )

    def _parse_tribe(self, el: Tag, url: str) -> EventData | None:
        title_el = el.select_one(
            ".tribe-events-list-event-title a, "
            ".tribe-events-list-event-title, "
            ".tribe-events-calendar-list__event-title a, "
            "h2 a, h3 a"
        )
        if not title_el:
            return None
        title = title_el.get_text(strip=True)
        if not title:
            return None

        date_el = el.select_one(
            ".tribe-event-schedule-details, .tribe-events-schedule, .tribe-event-date-start"
        )
        date = date_el.get_text(strip=True) if date_el else None

        time_el = el.select_one(".tribe-event-time")
        time_str = time_el.get_text(strip=True) if time_el else None

        loc_el = el.select_one(".tribe-venue, .tribe-venue-location, .tribe-events-venue-details")
        address = loc_el.get_text(" ", strip=True) if loc_el else None

        desc_el = el.select_one(".tribe-events-list-event-description, .tribe-events-content")
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

    # -- Events Manager --------------------------------------------------------

    def _em_containers(self, soup: BeautifulSoup) -> list[Tag]:
        return (
            soup.select(".em-events-list .em-item")
            or soup.select("#em-events .event")
            or soup.select(".event-list .event")
            or []
        )

    def _parse_em(self, el: Tag, url: str) -> EventData | None:
        title_el = el.select_one(".event-title a, .event-title, h2 a, h3 a, h2, h3")
        if not title_el:
            return None
        title = title_el.get_text(strip=True)
        if not title:
            return None

        date_el = el.select_one(".event-date, time, .date, .em-event-date")
        date = date_el.get_text(strip=True) if date_el else None

        time_el = el.select_one(".event-time, .time, .em-event-time")
        time_str = time_el.get_text(strip=True) if time_el else None

        loc_el = el.select_one(".event-location, .location, address, .em-event-location")
        address = loc_el.get_text(" ", strip=True) if loc_el else None

        desc_el = el.select_one(".event-description, .description, .excerpt, p")
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

    # -- Generic WP fallback ---------------------------------------------------

    def _generic_containers(self, soup: BeautifulSoup) -> list[Tag]:
        for selector in [
            "article.post",
            ".entry-content article",
            ".post-list .post",
            ".content-area article",
        ]:
            found = soup.select(selector)
            if found:
                return found
        return []

    def _parse_generic(self, el: Tag, url: str) -> EventData | None:
        title_el = el.select_one("h2 a, h3 a, h2, h3, .entry-title a, .entry-title")
        if not title_el:
            return None
        title = title_el.get_text(strip=True)
        if not title:
            return None

        date_el = el.select_one("time, .date, .post-date, .published")
        date = date_el.get_text(strip=True) if date_el else None

        desc_el = el.select_one(".entry-summary, .entry-content, .excerpt, p")
        details = desc_el.get_text(strip=True) if desc_el else None

        return EventData(
            title=title,
            date=date,
            time=None,
            address=None,
            event_type="town_hall",
            additional_details=details,
            source_url=url,
            is_virtual=self._detect_virtual(el.get_text()),
            raw_html_snippet=self._snippet(el),
        )
