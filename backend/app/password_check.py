"""Check passwords against a list of commonly breached passwords."""

import hashlib
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Load breached password hashes once at import time.
# We store SHA-1 hashes so the raw passwords aren't in memory.
_BREACHED_HASHES: set[str] = set()
_DATA_FILE = Path(__file__).parent / "data" / "breached_passwords.txt"


def _load_breached_passwords() -> set[str]:
    """Load top breached passwords and return their SHA-1 hashes."""
    hashes = set()
    if not _DATA_FILE.exists():
        logger.warning("Breached password list not found at %s", _DATA_FILE)
        return hashes
    with open(_DATA_FILE) as f:
        for line in f:
            pw = line.strip()
            if pw:
                hashes.add(hashlib.sha1(pw.encode()).hexdigest().upper())
    logger.info("Loaded %d breached password hashes", len(hashes))
    return hashes


_BREACHED_HASHES = _load_breached_passwords()


def is_breached_password(password: str) -> bool:
    """Check if a password appears in the common breached passwords list."""
    if not _BREACHED_HASHES:
        return False
    pw_hash = hashlib.sha1(password.encode()).hexdigest().upper()
    return pw_hash in _BREACHED_HASHES
