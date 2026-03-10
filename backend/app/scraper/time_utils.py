"""Shared time extraction utilities for all scrapers."""

import re

# Time range: "7:00 - 9:00pm", "7:00 a.m. – 9:00 p.m.", "10am-12pm", "10:30AM - 12:00PM"
_TIME_RANGE_RE = re.compile(
    r"(\d{1,2}(?::\d{2})?)\s*(?:a\.?m\.?|p\.?m\.?)?\s*[-\u2013\u2014to]+\s*"
    r"\d{1,2}(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)",
    re.IGNORECASE,
)

# Single time: "9 a.m.", "10:30 AM", "2:00 p.m.", "2pm", "10:00AM"
_TIME_RE = re.compile(
    r"(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))",
    re.IGNORECASE,
)

# Noon/midnight keywords
_NOON_RE = re.compile(r"\b(noon|12\s*(?:00\s*)?(?:p\.?m\.?|pm))\b", re.IGNORECASE)


def extract_start_time(text: str) -> str | None:
    """Extract the start time from text, handling ranges like '7:00 - 9:00pm'.

    Returns a normalized time string like "7:00 pm" or None.
    """
    # Check for noon
    m = _NOON_RE.search(text)
    if m:
        return "12:00 pm"

    # Try range first: "7:00 - 9:00pm" -> "7:00 pm"
    m = _TIME_RANGE_RE.search(text)
    if m:
        return f"{m.group(1)} {m.group(2)}"

    # Single time: "9 a.m." -> "9 a.m."
    m = _TIME_RE.search(text)
    if m:
        return m.group(1)

    return None
