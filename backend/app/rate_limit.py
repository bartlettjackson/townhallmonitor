"""In-memory rate limiter for authentication endpoints.

Trade-off: in-memory store resets on deploy/restart. This is acceptable for
a small-team app on Railway. For higher-stakes scenarios, swap to Redis.
"""

import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field

from app.request_context import mask_email

logger = logging.getLogger(__name__)


@dataclass
class _Bucket:
    timestamps: list[float] = field(default_factory=list)

    def prune(self, window_seconds: float):
        cutoff = time.monotonic() - window_seconds
        self.timestamps = [t for t in self.timestamps if t > cutoff]

    def count(self, window_seconds: float) -> int:
        self.prune(window_seconds)
        return len(self.timestamps)

    def record(self):
        self.timestamps.append(time.monotonic())


class RateLimiter:
    def __init__(self):
        # key: (scope, identifier) → Bucket
        self._buckets: dict[tuple[str, str], _Bucket] = defaultdict(_Bucket)
        # Account lockouts: email → unlock_time (monotonic)
        self._account_locks: dict[str, float] = {}

    def _get(self, scope: str, key: str) -> _Bucket:
        return self._buckets[(scope, key)]

    def _cleanup(self):
        """Periodically prune stale buckets to prevent unbounded growth."""
        now = time.monotonic()
        stale = [
            k
            for k, b in self._buckets.items()
            if not b.timestamps or (now - b.timestamps[-1]) > 3600
        ]
        for k in stale:
            del self._buckets[k]
        stale_locks = [email for email, unlock in self._account_locks.items() if now > unlock]
        for email in stale_locks:
            del self._account_locks[email]

    # -- Per-IP login rate limiting --

    def check_login_ip(self, ip: str) -> int | None:
        """Check per-IP login limit (10 per 15 min).

        Returns None if allowed, or seconds until retry if blocked.
        """
        bucket = self._get("login_ip", ip)
        window = 900  # 15 minutes
        if bucket.count(window) >= 10:
            oldest_relevant = bucket.timestamps[0]
            retry_after = int(oldest_relevant + window - time.monotonic()) + 1
            logger.warning("Rate limit: login IP %s exceeded 10 attempts in 15 min", ip)
            return max(retry_after, 1)
        return None

    def record_login_ip(self, ip: str):
        self._get("login_ip", ip).record()

    # -- Per-account failed login limiting --

    def check_account_lock(self, ip: str, email: str) -> int | None:
        """Check if this (IP, account) pair is temporarily locked.

        Scoping the lock to the IP prevents a remote attacker from locking a
        victim out of their account by spamming bad passwords — only the
        attacker's own (IP, email) pair gets locked.

        Returns None if allowed, or seconds until unlock if locked.
        """
        lock_key = f"{ip}|{email}"
        unlock_at = self._account_locks.get(lock_key)
        if unlock_at and time.monotonic() < unlock_at:
            retry_after = int(unlock_at - time.monotonic()) + 1
            logger.warning("Rate limit: account %s is locked for IP %s", mask_email(email), ip)
            return max(retry_after, 1)
        return None

    def record_failed_login(self, ip: str, email: str):
        """Record a failed login attempt for this (IP, account) pair.

        After 5 failures in 30 min, lock the (IP, account) pair for 15 min.
        """
        lock_key = f"{ip}|{email}"
        bucket = self._get("login_account", lock_key)
        bucket.record()
        window = 1800  # 30 minutes
        if bucket.count(window) >= 5:
            self._account_locks[lock_key] = time.monotonic() + 900  # 15 min lock
            logger.warning(
                "Rate limit: account %s locked for 15 min after 5 failures (IP %s)",
                mask_email(email),
                ip,
            )

    def clear_failed_logins(self, ip: str, email: str):
        """Clear failed login count on successful login."""
        lock_key = f"{ip}|{email}"
        key = ("login_account", lock_key)
        if key in self._buckets:
            del self._buckets[key]
        self._account_locks.pop(lock_key, None)

    # -- Per-IP invite/register rate limiting --

    def check_register_ip(self, ip: str) -> int | None:
        """Check per-IP register/invite limit (5 per hour).

        Returns None if allowed, or seconds until retry if blocked.
        """
        bucket = self._get("register_ip", ip)
        window = 3600  # 1 hour
        if bucket.count(window) >= 5:
            oldest_relevant = bucket.timestamps[0]
            retry_after = int(oldest_relevant + window - time.monotonic()) + 1
            logger.warning("Rate limit: register IP %s exceeded 5 attempts in 1 hour", ip)
            return max(retry_after, 1)
        return None

    def record_register_ip(self, ip: str):
        self._get("register_ip", ip).record()


# Singleton instance
limiter = RateLimiter()
