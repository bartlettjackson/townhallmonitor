"""Scraper for California Senate sites (sd*.senate.ca.gov).

Senate sites are Drupal-based. Event content often appears under
/events, /calendar, or /town-hall paths. The markup uses Drupal's
views system with .views-row containers and field-based layouts.
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


class SenateScraper(BaseScraper):
    name = "senate"

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

        # Enrich events missing time from detail pages
        for ev, href in zip(events, detail_hrefs):
            if href and (not ev.time or not ev.address):
                await self._enrich_from_detail(ev, href)

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

        if not date:
            date = self._date_from_url(el)

        time_el = el.select_one(".views-field-field-time .field-content, .time, .event-time")
        time_str = time_el.get_text(strip=True) if time_el else None

        # Fallback: extract time from body text within the container
        if not time_str:
            body_el = el.select_one(".field--name-body, .node__content")
            if body_el:
                for p in body_el.select("p"):
                    t = extract_start_time(p.get_text())
                    if t:
                        time_str = t
                        break

        # If still no time, try the full container text
        if not time_str:
            time_str = extract_start_time(el.get_text())

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

    async def _enrich_from_detail(self, ev: EventData, detail_url: str):
        """Fetch a Senate event detail page and extract time/address."""
        html = await self.fetch_page(detail_url)
        if not html:
            return

        soup = BeautifulSoup(html, "html.parser")

        # Senate uses .field--name-field-date-of-event with combined date+time
        # e.g., "Sat, Feb 28 2026, 8 - 11am"
        date_field = soup.select_one(".field--name-field-date-of-event")
        if date_field and not ev.time:
            text = date_field.get_text(strip=True)
            t = extract_start_time(text)
            if t:
                ev.time = t

        lines = _extract_body_lines(soup)

        if not ev.time and lines:
            for line in lines:
                t = extract_start_time(line)
                if t:
                    ev.time = t
                    break

        if not ev.address and lines:
            addr = _extract_address_from_lines(lines)
            if addr:
                ev.address = addr

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


_ADDR_RE = re.compile(r"\d+\s+[\w\s.]+(?:St|Ave|Blvd|Dr|Rd|Way|Ln|Ct|Pl|Hwy)\.?")
_ZIP_RE = re.compile(r"[A-Z][a-z]+,?\s+CA\s+\d{5}")


def _extract_body_lines(soup: BeautifulSoup) -> list[str]:
    """Get text lines from the main event body on a Senate detail page.

    Senate detail pages have multiple .field--name-body blocks (fire alerts,
    social links, event content, office info, footer). We want the one with
    event content — typically the block containing an address or time.
    Content lives in direct <p> children, not .field__item.
    """
    best_lines: list[str] = []
    for body_el in soup.select(".field--name-body"):
        paragraphs = body_el.select("p")
        if not paragraphs:
            continue
        lines = [p.get_text(strip=True) for p in paragraphs if p.get_text(strip=True)]
        text = " ".join(lines)
        if len(text) < 30 or len(text) > 5000:
            continue
        if _ADDR_RE.search(text) or _ZIP_RE.search(text) or _TIME_RE.search(text):
            return lines
        if len(lines) > len(best_lines):
            best_lines = lines
    return best_lines


def _extract_address_from_lines(lines: list[str]) -> str | None:
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
