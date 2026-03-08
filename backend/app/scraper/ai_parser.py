"""AI-powered fallback parser using Claude API.

Used when pattern-based scrapers fail to extract events from a legislator's
website. Cleans the HTML down to main content, sends it to Claude Sonnet,
and parses the structured JSON response into EventData objects.
"""

import json
import logging
import re

import anthropic
from bs4 import BeautifulSoup

from app.config import ANTHROPIC_API_KEY
from app.scraper.event_data import EventData

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-20250514"
MAX_HTML_CHARS = 80_000  # stay well within context window after prompt overhead

SYSTEM_PROMPT = (
    "You are an expert at extracting public event information from elected "
    "officials' websites. Extract ONLY constituent-facing events like town "
    "halls, community meetings, sidewalk coffees, mobile office hours, and "
    "public forums. Do NOT include committee hearings, legislative sessions, "
    "fundraisers, or press conferences."
)

USER_PROMPT = (
    "Extract all upcoming public events from this webpage content. "
    "For each event return JSON with: title, date (YYYY-MM-DD), "
    "time (HH:MM, 24hr), address (full street address or 'Virtual' if online), "
    "event_type (Town Hall, Community Meeting, Sidewalk Coffee, Mobile Office, "
    "Public Forum, Other), additional_details (any other relevant info), "
    "is_virtual (boolean). If there are no upcoming constituent events, return "
    "an empty array. Return ONLY valid JSON array, no other text.\n\n"
    "Webpage content:\n"
    "```\n{content}\n```"
)


def clean_html(raw_html: str) -> str:
    """Strip non-content elements, return text-heavy HTML of the main content."""
    soup = BeautifulSoup(raw_html, "html.parser")

    # Remove elements that never contain event info
    for tag in soup.select("script, style, nav, footer, header, noscript, iframe, svg"):
        tag.decompose()

    # Remove common boilerplate containers
    for selector in [
        "#site-header",
        "#site-footer",
        ".nav-menu",
        ".navigation",
        ".sidebar",
        "#sidebar",
        ".cookie-banner",
        ".social-share",
        ".breadcrumb",
        ".skip-link",
    ]:
        for el in soup.select(selector):
            el.decompose()

    # Try to narrow to main content area
    main = (
        soup.select_one("main")
        or soup.select_one('[role="main"]')
        or soup.select_one("#content")
        or soup.select_one(".content")
        or soup.select_one("article")
        or soup.body
        or soup
    )

    # Get the remaining HTML — compact whitespace but preserve structure
    text = main.get_text(separator="\n", strip=True)

    # Collapse runs of blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text[:MAX_HTML_CHARS]


class AIParser:
    def __init__(self):
        if not ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY not configured — cannot use AI parser")
        self._client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        self.last_usage: anthropic.types.Usage | None = None

    async def parse_events(self, raw_html: str, source_url: str) -> list[EventData]:
        """Send cleaned HTML to Claude and parse the response into EventData."""
        content = clean_html(raw_html)
        if len(content.strip()) < 50:
            logger.info("Page content too short after cleaning, skipping AI parse")
            return []

        prompt = USER_PROMPT.format(content=content)

        try:
            # anthropic SDK's create() is sync; run in default executor to
            # avoid blocking the event loop.
            import asyncio

            response = await asyncio.to_thread(
                self._client.messages.create,
                model=MODEL,
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )
        except anthropic.RateLimitError:
            logger.warning("Claude API rate limited during AI parse of %s", source_url)
            return []
        except anthropic.APIStatusError as exc:
            logger.error(
                "Claude API error (%s) parsing %s: %s", exc.status_code, source_url, exc.message
            )
            return []
        except anthropic.APIConnectionError as exc:
            logger.error("Claude API connection error parsing %s: %s", source_url, exc)
            return []

        self.last_usage = response.usage

        # Extract text from response
        raw_text = ""
        for block in response.content:
            if block.type == "text":
                raw_text += block.text

        return self._parse_response(raw_text, source_url)

    def _parse_response(self, raw_text: str, source_url: str) -> list[EventData]:
        """Parse Claude's JSON response into EventData objects."""
        # Strip markdown fences if present
        text = raw_text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*\n?", "", text)
            text = re.sub(r"\n?```\s*$", "", text)

        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse AI response as JSON: %s\nRaw: %.500s", exc, raw_text)
            return []

        if not isinstance(data, list):
            # Sometimes Claude wraps in {"events": [...]}
            if isinstance(data, dict) and "events" in data:
                data = data["events"]
            else:
                logger.error("AI response is not a JSON array: %s", type(data))
                return []

        events: list[EventData] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            title = item.get("title", "").strip()
            if not title:
                continue
            events.append(
                EventData(
                    title=title,
                    date=_str_or_none(item.get("date")),
                    time=_str_or_none(item.get("time")),
                    address=_str_or_none(item.get("address")),
                    event_type=_str_or_none(item.get("event_type")),
                    additional_details=_str_or_none(item.get("additional_details")),
                    source_url=source_url,
                    is_virtual=bool(item.get("is_virtual", False)),
                )
            )

        logger.info("AI parser extracted %d events from %s", len(events), source_url)
        return events

    def get_cost_estimate(self) -> dict | None:
        """Return cost estimate for the last API call based on usage."""
        if not self.last_usage:
            return None
        return estimate_cost(self.last_usage.input_tokens, self.last_usage.output_tokens)


def _str_or_none(val) -> str | None:
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


# -- cost tracking -------------------------------------------------------------

# Sonnet pricing as of 2025-05 (per million tokens)
SONNET_INPUT_COST_PER_M = 3.00
SONNET_OUTPUT_COST_PER_M = 15.00


def estimate_cost(input_tokens: int, output_tokens: int) -> dict:
    """Estimate USD cost for a single API call."""
    input_cost = (input_tokens / 1_000_000) * SONNET_INPUT_COST_PER_M
    output_cost = (output_tokens / 1_000_000) * SONNET_OUTPUT_COST_PER_M
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "input_cost_usd": round(input_cost, 6),
        "output_cost_usd": round(output_cost, 6),
        "total_cost_usd": round(input_cost + output_cost, 6),
    }


def estimate_batch_cost(
    num_legislators: int, avg_input_tokens: int = 20_000, avg_output_tokens: int = 500
) -> dict:
    """Estimate total cost for an AI parse run across N legislators.

    Defaults assume ~20K input tokens (cleaned HTML) and ~500 output tokens
    per legislator — typical for a page with a few events.
    """
    per_call = estimate_cost(avg_input_tokens, avg_output_tokens)
    return {
        "num_legislators": num_legislators,
        "per_call": per_call,
        "total_cost_usd": round(per_call["total_cost_usd"] * num_legislators, 4),
    }
