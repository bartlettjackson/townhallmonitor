"""Shared test fixtures — in-memory SQLite via aiosqlite."""

import os

# Set test config BEFORE any app imports
os.environ["AUTH_SECRET_KEY"] = "test-secret-key-that-is-long-enough"
os.environ["INVITE_CODE"] = "test-invite"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite://"
os.environ["LOG_FORMAT"] = "text"

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth import create_token, hash_password
from app.database import Base, get_session
from app.models.event import Event  # noqa: F401
from app.models.legislator import Legislator
from app.models.scrape_log import ScrapeLog  # noqa: F401
from app.models.user import User

# Single engine shared across all tests
_engine = create_async_engine("sqlite+aiosqlite://", echo=False)
_async_session_factory = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(autouse=True)
async def _setup_tables():
    """Create all tables before each test and drop them after."""
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def db_session():
    async with _async_session_factory() as session:
        yield session


@pytest.fixture
async def client():
    from app.main import app

    async def override_get_session():
        async with _async_session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
async def test_user(db_session: AsyncSession):
    user = User(
        email="test@example.com",
        hashed_password=hash_password("testpass123"),
        name="Test User",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    token = create_token(user.id, user.email)
    return user, token


@pytest.fixture
async def auth_headers(test_user):
    _, token = test_user
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def sample_legislator(db_session: AsyncSession):
    leg = Legislator(
        name="Jane Smith",
        chamber="assembly",
        district="42",
        party="Democrat",
        official_website="https://a42.asmdc.org",
        campaign_website=None,
        facebook_url=None,
    )
    db_session.add(leg)
    await db_session.commit()
    await db_session.refresh(leg)
    return leg
