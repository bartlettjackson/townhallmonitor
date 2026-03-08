"""Tests for pattern-based scraper extraction."""

from pathlib import Path

import pytest

from app.scraper.asmdc import AsmDcScraper
from app.scraper.asmrc import AsmRcScraper
from app.scraper.senate import SenateScraper
from app.scraper.wordpress import WordPressScraper

FIXTURES = Path(__file__).parent / "fixtures"


def _read_fixture(name: str) -> str:
    return (FIXTURES / name).read_text()


# ---------------------------------------------------------------------------
# AsmDcScraper
# ---------------------------------------------------------------------------


class TestAsmDcScraper:
    @pytest.fixture
    def scraper(self):
        return AsmDcScraper()

    @pytest.fixture
    def html(self):
        return _read_fixture("asmdc_tribe_events.html")

    async def test_extracts_constituent_events(self, scraper, html):
        events = await scraper.extract_events(html, "https://a42.asmdc.org/events")
        # Should get town hall + virtual office hours, NOT committee hearing
        assert len(events) == 2
        titles = [e.title for e in events]
        assert "Community Town Hall Meeting" in titles
        assert "Virtual Office Hours" in titles

    async def test_filters_committee_hearings(self, scraper, html):
        events = await scraper.extract_events(html, "https://a42.asmdc.org/events")
        titles = [e.title for e in events]
        assert "Committee Hearing on Education" not in titles

    async def test_detects_virtual_events(self, scraper, html):
        events = await scraper.extract_events(html, "https://a42.asmdc.org/events")
        virtual = [e for e in events if e.title == "Virtual Office Hours"][0]
        assert virtual.is_virtual is True

    async def test_extracts_details(self, scraper, html):
        events = await scraper.extract_events(html, "https://a42.asmdc.org/events")
        town_hall = [e for e in events if e.title == "Community Town Hall Meeting"][0]
        assert town_hall.date == "March 15, 2026"
        assert town_hall.time == "6:00 PM - 8:00 PM"
        assert "Sacramento Community Center" in town_hall.address
        assert town_hall.source_url == "https://a42.asmdc.org/events"

    async def test_empty_html_returns_empty(self, scraper):
        events = await scraper.extract_events("<html><body></body></html>", "https://example.com")
        assert events == []


# ---------------------------------------------------------------------------
# AsmRcScraper
# ---------------------------------------------------------------------------


class TestAsmRcScraper:
    @pytest.fixture
    def scraper(self):
        return AsmRcScraper()

    @pytest.fixture
    def html(self):
        return _read_fixture("asmrc_event_listing.html")

    async def test_extracts_constituent_events(self, scraper, html):
        events = await scraper.extract_events(html, "https://a23.asmrc.org/events")
        # Should get sidewalk coffee, NOT press conference
        assert len(events) == 1
        assert events[0].title == "Sidewalk Coffee with the Assemblymember"

    async def test_filters_press_conferences(self, scraper, html):
        events = await scraper.extract_events(html, "https://a23.asmrc.org/events")
        titles = [e.title for e in events]
        assert "Press Conference on Water Policy" not in titles

    async def test_extracts_address(self, scraper, html):
        events = await scraper.extract_events(html, "https://a23.asmrc.org/events")
        assert "Starbucks" in events[0].address

    async def test_empty_html_returns_empty(self, scraper):
        events = await scraper.extract_events("<html><body></body></html>", "https://example.com")
        assert events == []


# ---------------------------------------------------------------------------
# SenateScraper
# ---------------------------------------------------------------------------


class TestSenateScraper:
    @pytest.fixture
    def scraper(self):
        return SenateScraper()

    @pytest.fixture
    def html(self):
        return _read_fixture("senate_drupal_views.html")

    async def test_extracts_constituent_events(self, scraper, html):
        events = await scraper.extract_events(html, "https://sd31.senate.ca.gov/events")
        # Should get town hall + resource fair, NOT budget hearing
        assert len(events) == 2
        titles = [e.title for e in events]
        assert "Senator's Town Hall" in titles
        assert "Resource Fair & Workshop" in titles

    async def test_filters_budget_hearings(self, scraper, html):
        events = await scraper.extract_events(html, "https://sd31.senate.ca.gov/events")
        titles = [e.title for e in events]
        assert "Budget Hearing on Transportation" not in titles

    async def test_extracts_drupal_fields(self, scraper, html):
        events = await scraper.extract_events(html, "https://sd31.senate.ca.gov/events")
        town_hall = [e for e in events if e.title == "Senator's Town Hall"][0]
        assert town_hall.date == "March 28, 2026"
        assert "5:30 PM" in town_hall.time
        assert "Riverside County" in town_hall.address

    async def test_empty_html_returns_empty(self, scraper):
        events = await scraper.extract_events("<html><body></body></html>", "https://example.com")
        assert events == []


# ---------------------------------------------------------------------------
# WordPressScraper — Tribe, EM, Generic
# ---------------------------------------------------------------------------


class TestWordPressScraperTribe:
    @pytest.fixture
    def scraper(self):
        return WordPressScraper()

    async def test_tribe_extraction(self, scraper):
        html = _read_fixture("wordpress_tribe.html")
        events = await scraper.extract_events(html, "https://example.com/events")
        assert len(events) == 1
        assert events[0].title == "Neighborhood Walk with Rep. Johnson"
        assert events[0].date == "April 10, 2026"


class TestWordPressScraperEM:
    @pytest.fixture
    def scraper(self):
        return WordPressScraper()

    async def test_em_extraction(self, scraper):
        html = _read_fixture("wordpress_em.html")
        events = await scraper.extract_events(html, "https://example.com/events")
        assert len(events) == 1
        assert events[0].title == "Mobile Office Hours"
        assert "East Branch Library" in events[0].address


class TestWordPressScraperGeneric:
    @pytest.fixture
    def scraper(self):
        return WordPressScraper()

    async def test_generic_extraction(self, scraper):
        html = _read_fixture("wordpress_generic.html")
        events = await scraper.extract_events(html, "https://example.com/events")
        assert len(events) == 2
        titles = [e.title for e in events]
        assert "Listening Session on Healthcare" in titles
        assert "District Office Open House" in titles

    async def test_generic_has_no_time_or_address(self, scraper):
        html = _read_fixture("wordpress_generic.html")
        events = await scraper.extract_events(html, "https://example.com/events")
        for ev in events:
            assert ev.time is None
            assert ev.address is None

    async def test_empty_html_returns_empty(self, scraper):
        events = await scraper.extract_events("<html><body></body></html>", "https://example.com")
        assert events == []
