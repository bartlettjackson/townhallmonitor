"""Shared time extraction utilities for all scrapers."""

import re

# Time range with BOTH start and end am/pm:
#   "11 a.m. - 1 p.m.", "10:00 AM - 12:00 PM"
_TIME_RANGE_BOTH_RE = re.compile(
    r"(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)\s*[-\u2013\u2014]+\s*"
    r"\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)",
    re.IGNORECASE,
)

# Time range with only end am/pm:
#   "7:00 - 9:00pm", "10-12pm", "9 – 11 a.m."
_TIME_RANGE_END_RE = re.compile(
    r"(\d{1,2}(?::\d{2})?)\s*[-\u2013\u2014]+\s*"
    r"(\d{1,2})(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)",
    re.IGNORECASE,
)

# Single time: "9 a.m.", "10:30 AM", "2:00 p.m.", "2pm", "10:00AM"
_TIME_RE = re.compile(
    r"(\d{1,2}(?::\d{2})?)\s*(a\.?m\.?|p\.?m\.?)",
    re.IGNORECASE,
)

# Noon/midnight keywords
_NOON_RE = re.compile(r"\b(noon|12\s*(?::?00\s*)?(?:p\.?m\.?|pm))\b", re.IGNORECASE)


def _normalize_period(period: str) -> str:
    """Normalize 'a.m.' / 'A.M.' / 'am' / 'AM' -> 'am' or 'pm'."""
    return "am" if "a" in period.lower() else "pm"


def _infer_start_period(start_hour: int, end_hour: int, end_period: str) -> str:
    """Infer am/pm for start time when only end period is given.

    Heuristic: if start > end numerically (e.g. 11-1), they cross
    the am/pm boundary, so start is the opposite period.
    Exception: 12-1pm means both are pm (12pm-1pm).
    """
    ep = _normalize_period(end_period)
    # Normalize 12 to 0 for comparison
    s = start_hour % 12
    e = end_hour % 12
    if s > e and start_hour != 12:
        # Crosses boundary: 11-1pm means 11am-1pm
        return "am" if ep == "pm" else "pm"
    return ep


def extract_start_time(text: str) -> str | None:
    """Extract the start time from text, handling ranges like '11 a.m. - 1 p.m.'.

    Returns a normalized time string like "11:00 am" or None.
    """
    # Check for noon
    m = _NOON_RE.search(text)
    if m:
        return "12:00 pm"

    # Range with BOTH am/pm: "11 a.m. - 1 p.m." -> use start's own period
    m = _TIME_RANGE_BOTH_RE.search(text)
    if m:
        return f"{m.group(1)} {_normalize_period(m.group(2))}"

    # Range with only end am/pm: "7 - 9pm" -> infer start period
    m = _TIME_RANGE_END_RE.search(text)
    if m:
        start_str = m.group(1)
        end_str = m.group(2)
        end_period = m.group(3)
        start_hour = int(start_str.split(":")[0])
        end_hour = int(end_str.split(":")[0])
        period = _infer_start_period(start_hour, end_hour, end_period)
        return f"{start_str} {period}"

    # Single time: "9 a.m." -> "9 am"
    m = _TIME_RE.search(text)
    if m:
        return f"{m.group(1)} {_normalize_period(m.group(2))}"

    return None
