"""Simple in-memory TTL cache — no external dependencies."""

import time

_cache: dict[str, tuple[float, object]] = {}
DEFAULT_TTL = 300  # 5 minutes


def cache_get(key: str) -> object | None:
    """Return cached value if present and not expired, else None."""
    entry = _cache.get(key)
    if entry is None:
        return None
    expires_at, value = entry
    if time.monotonic() > expires_at:
        del _cache[key]
        return None
    return value


def cache_set(key: str, value: object, ttl: int = DEFAULT_TTL) -> None:
    """Store a value with TTL (seconds)."""
    _cache[key] = (time.monotonic() + ttl, value)


def cache_invalidate(key: str) -> None:
    """Remove a specific key from the cache."""
    _cache.pop(key, None)


def cache_clear() -> None:
    """Remove all entries."""
    _cache.clear()
