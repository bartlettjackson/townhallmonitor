"""Map URL patterns to the appropriate scraper class."""

import re

from app.scraper.asmdc import AsmDcScraper
from app.scraper.asmrc import AsmRcScraper
from app.scraper.base import BaseScraper
from app.scraper.senate import SenateScraper
from app.scraper.wordpress import WordPressScraper

# Ordered list: first match wins.
_PATTERNS: list[tuple[re.Pattern, type[BaseScraper]]] = [
    (re.compile(r"\.asmdc\.org", re.IGNORECASE), AsmDcScraper),
    (re.compile(r"\.asmrc\.org", re.IGNORECASE), AsmRcScraper),
    (re.compile(r"\.senate\.ca\.gov", re.IGNORECASE), SenateScraper),
]


def get_scraper_for_url(url: str) -> BaseScraper:
    """Return the best scraper instance for a given URL.

    Falls back to WordPressScraper for unrecognised domains (campaign sites, etc.).
    """
    for pattern, scraper_cls in _PATTERNS:
        if pattern.search(url):
            return scraper_cls()
    return WordPressScraper()


def scraper_name_for_url(url: str) -> str:
    """Return the *name* of the scraper that would be chosen, without instantiating."""
    for pattern, scraper_cls in _PATTERNS:
        if pattern.search(url):
            return scraper_cls.name
    return WordPressScraper.name
