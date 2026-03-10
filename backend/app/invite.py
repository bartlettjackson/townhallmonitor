"""Invite code generation and validation."""

import hashlib
import logging
import secrets
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invite_code import InviteCode

logger = logging.getLogger(__name__)

INVITE_CODE_BYTES = 24  # 32 url-safe chars
DEFAULT_EXPIRY_DAYS = 7
DEFAULT_MAX_USES = 1


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


async def generate_invite_code(
    session: AsyncSession,
    created_by: int,
    max_uses: int = DEFAULT_MAX_USES,
    expiry_days: int = DEFAULT_EXPIRY_DAYS,
) -> str:
    """Create a new invite code. Returns the raw code (only shown once)."""
    raw_code = secrets.token_urlsafe(INVITE_CODE_BYTES)
    code_hash = _hash_code(raw_code)

    invite = InviteCode(
        code_hash=code_hash,
        max_uses=max_uses,
        times_used=0,
        expires_at=datetime.utcnow() + timedelta(days=expiry_days),
        created_by=created_by,
    )
    session.add(invite)
    await session.commit()
    return raw_code


async def validate_and_consume_invite(code: str, ip: str, session: AsyncSession) -> bool:
    """Validate an invite code and consume one use.

    Returns True if valid, False otherwise.
    Same generic False for expired, exhausted, or non-existent codes.
    """
    code_hash = _hash_code(code)

    result = await session.execute(select(InviteCode).where(InviteCode.code_hash == code_hash))
    invite = result.scalar_one_or_none()

    if not invite:
        logger.warning("Invalid invite code attempt from IP=%s", ip)
        return False

    if invite.expires_at < datetime.utcnow():
        logger.warning("Expired invite code attempt from IP=%s", ip)
        return False

    if invite.times_used >= invite.max_uses:
        logger.warning("Exhausted invite code attempt from IP=%s", ip)
        return False

    invite.times_used += 1
    await session.commit()
    return True
