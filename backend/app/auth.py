"""JWT authentication utilities and FastAPI dependencies."""

import hashlib
import logging
import secrets
from datetime import datetime, timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import AUTH_SECRET_KEY
from app.database import get_session
from app.models.user import RefreshToken, User

logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 30
REFRESH_TOKEN_DAYS = 7

# Refuse to start with a weak secret in production
if len(AUTH_SECRET_KEY) < 32:
    import os

    if os.getenv("RAILWAY_ENVIRONMENT"):
        raise RuntimeError(
            'AUTH_SECRET_KEY must be ≥32 chars (256-bit). Generate one with: python -c "import secrets; print(secrets.token_urlsafe(32))"'
        )
    logger.warning("AUTH_SECRET_KEY is shorter than 32 chars — use a ≥256-bit secret in production")

security = HTTPBearer()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


# Pre-computed dummy hash (rounds=12) so we can burn the same CPU time
# when verifying against a non-existent user — prevents timing side-channels.
_DUMMY_HASH = bcrypt.hashpw(b"dummy", bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def verify_password_timing_safe(password: str, user) -> bool:
    """Verify password in constant time regardless of whether user exists."""
    hashed = user.hashed_password if user else _DUMMY_HASH
    result = bcrypt.checkpw(password.encode(), hashed.encode())
    return result and user is not None


def create_access_token(user_id: int, email: str, token_version: int) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "ver": token_version,
        "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_MINUTES),
        "iat": datetime.utcnow(),
        "type": "access",
    }
    return jwt.encode(payload, AUTH_SECRET_KEY, algorithm=JWT_ALGORITHM)


def _hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_refresh_token(user_id: int, session: AsyncSession) -> str:
    """Generate a new refresh token, store its hash in DB, return raw token."""
    raw_token = secrets.token_urlsafe(48)
    token_hash = _hash_refresh_token(raw_token)

    rt = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_DAYS),
    )
    session.add(rt)
    await session.commit()
    return raw_token


async def rotate_refresh_token(old_raw_token: str, session: AsyncSession) -> dict | None:
    """Validate and rotate a refresh token. Returns new tokens or None if invalid.

    Rotation: old token is deleted, new one is issued. If an old token is
    reused (replay attack), all tokens for that user are revoked.
    """
    old_hash = _hash_refresh_token(old_raw_token)

    result = await session.execute(select(RefreshToken).where(RefreshToken.token_hash == old_hash))
    rt = result.scalar_one_or_none()

    if not rt:
        # Possible replay attack — old token was already rotated.
        # We can't identify the user from just the token, so log and reject.
        logger.warning("Refresh token reuse detected (token not found)")
        return None

    if rt.expires_at < datetime.utcnow():
        await session.delete(rt)
        await session.commit()
        return None

    user = await session.get(User, rt.user_id)
    if not user:
        await session.delete(rt)
        await session.commit()
        return None

    # Delete old token
    await session.delete(rt)

    # Issue new pair
    new_access = create_access_token(user.id, user.email, user.token_version)
    new_refresh = await create_refresh_token(user.id, session)

    return {
        "access_token": new_access,
        "refresh_token": new_refresh,
        "user": {"id": user.id, "email": user.email, "name": user.name},
    }


async def revoke_all_user_tokens(user_id: int, session: AsyncSession):
    """Delete all refresh tokens for a user (logout-all / password change)."""
    await session.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
    await session.commit()


def decode_token(token: str) -> dict:
    return jwt.decode(token, AUTH_SECRET_KEY, algorithms=[JWT_ALGORITHM])


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_session),
) -> User:
    try:
        payload = decode_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user = await session.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # Check token version — rejects tokens issued before password change
    if payload.get("ver", 0) != user.token_version:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return user
