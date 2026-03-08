"""Tests for AI parser — mocked Claude API."""

import json
from unittest.mock import patch

import pytest

from app.scraper.ai_parser import AIParser, clean_html, estimate_cost


class TestCleanHtml:
    def test_removes_nav_footer_script(self):
        html = """
        <html>
        <body>
            <nav>Navigation</nav>
            <script>var x = 1;</script>
            <style>.foo { color: red; }</style>
            <footer>Footer content</footer>
            <main><p>Important content here</p></main>
        </body>
        </html>
        """
        result = clean_html(html)
        assert "Navigation" not in result
        assert "var x = 1" not in result
        assert "color: red" not in result
        assert "Footer content" not in result
        assert "Important content here" in result

    def test_truncates_to_max_chars(self):
        html = "<html><body><main>" + "x" * 100_000 + "</main></body></html>"
        result = clean_html(html)
        assert len(result) <= 80_000

    def test_narrows_to_main_content(self):
        html = """
        <html><body>
            <div id="sidebar">Sidebar stuff</div>
            <main><p>Main content</p></main>
        </body></html>
        """
        result = clean_html(html)
        assert "Main content" in result

    def test_removes_sidebar(self):
        html = """
        <html><body>
            <div class="sidebar">Sidebar junk</div>
            <main><p>Real content</p></main>
        </body></html>
        """
        result = clean_html(html)
        assert "Sidebar junk" not in result


class TestAIParserParseResponse:
    @pytest.fixture
    def parser(self):
        with patch("app.scraper.ai_parser.ANTHROPIC_API_KEY", "test-key"):
            with patch("anthropic.Anthropic"):
                p = AIParser()
                return p

    def test_valid_json_array(self, parser):
        raw = json.dumps(
            [
                {
                    "title": "Town Hall Meeting",
                    "date": "2026-03-15",
                    "time": "18:00",
                    "address": "123 Main St",
                    "event_type": "Town Hall",
                    "additional_details": "Open to public",
                    "is_virtual": False,
                }
            ]
        )
        events = parser._parse_response(raw, "https://example.com")
        assert len(events) == 1
        assert events[0].title == "Town Hall Meeting"
        assert events[0].date == "2026-03-15"
        assert events[0].time == "18:00"
        assert events[0].address == "123 Main St"
        assert events[0].is_virtual is False

    def test_markdown_fenced_response(self, parser):
        raw = '```json\n[{"title": "Community Forum", "date": "2026-04-01"}]\n```'
        events = parser._parse_response(raw, "https://example.com")
        assert len(events) == 1
        assert events[0].title == "Community Forum"

    def test_events_wrapper_object(self, parser):
        raw = json.dumps(
            {
                "events": [
                    {"title": "Workshop", "date": "2026-05-01"},
                    {"title": "Open House", "date": "2026-05-10"},
                ]
            }
        )
        events = parser._parse_response(raw, "https://example.com")
        assert len(events) == 2

    def test_empty_array(self, parser):
        events = parser._parse_response("[]", "https://example.com")
        assert events == []

    def test_invalid_json(self, parser):
        events = parser._parse_response("not json at all", "https://example.com")
        assert events == []

    def test_skips_items_without_title(self, parser):
        raw = json.dumps(
            [
                {"title": "Valid Event", "date": "2026-03-15"},
                {"date": "2026-03-20"},  # no title
                {"title": "", "date": "2026-03-25"},  # empty title
            ]
        )
        events = parser._parse_response(raw, "https://example.com")
        assert len(events) == 1
        assert events[0].title == "Valid Event"


class TestEstimateCost:
    def test_cost_calculation(self):
        cost = estimate_cost(20_000, 500)
        assert cost["input_tokens"] == 20_000
        assert cost["output_tokens"] == 500
        # 20K * $3/M = $0.06
        assert cost["input_cost_usd"] == 0.06
        # 500 * $15/M = $0.0075
        assert cost["output_cost_usd"] == 0.0075
        assert cost["total_cost_usd"] == 0.0675

    def test_zero_tokens(self):
        cost = estimate_cost(0, 0)
        assert cost["total_cost_usd"] == 0.0
