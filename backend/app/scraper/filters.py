"""Filter out non-constituent-facing events (hearings, sessions, pressers)."""

import re

EXCLUDED_PATTERNS: list[re.Pattern] = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"\bcommittee\s+(hearing|meeting|session)\b",
        r"\bsubcommittee\b",
        r"\bjoint\s+hearing\b",
        r"\bfloor\s+session\b",
        r"\blegislative\s+session\b",
        r"\bpress\s+conference\b",
        r"\bpress\s+briefing\b",
        r"\bmedia\s+availability\b",
        r"\bcaucus\s+meeting\b",
        r"\boversight\s+hearing\b",
        r"\bbudget\s+(hearing|markup)\b",
        r"\bconfirmation\s+hearing\b",
        r"\bappropriations\b",
        r"\brules\s+committee\b",
        r"\binformational\s+hearing\b",
        r"\bselect\s+committee\b",
    ]
]

CONSTITUENT_KEYWORDS: list[re.Pattern] = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"\btown\s*hall\b",
        r"\bcommunity\s+(event|meeting|forum)\b",
        r"\boffice\s+hours?\b",
        r"\bconstituent\b",
        r"\bneighborhood\b",
        r"\bopen\s+house\b",
        r"\bresource\s+fair\b",
        r"\bworkshop\b",
        r"\blistening\s+session\b",
        r"\btelephone\s+town\s*hall\b",
    ]
]


def is_constituent_event(title: str, details: str | None = None) -> bool:
    text = f"{title} {details or ''}"
    if any(pat.search(text) for pat in EXCLUDED_PATTERNS):
        return False
    return True
