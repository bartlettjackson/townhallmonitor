import os

from dotenv import load_dotenv

load_dotenv()

# Railway provides DATABASE_URL as postgres:// or postgresql://, but asyncpg
# needs the +asyncpg driver suffix.
_raw_db_url = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/townhall_db",
)
DATABASE_URL = _raw_db_url.replace("postgres://", "postgresql+asyncpg://", 1).replace(
    "postgresql://", "postgresql+asyncpg://", 1
)
if "+asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
AUTH_SECRET_KEY = os.getenv("AUTH_SECRET_KEY", "change-me")
INVITE_CODE = os.getenv("INVITE_CODE", "change-me-invite")

# CORS: comma-separated list of allowed origins
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()
]

# Scheduler: cron expression for daily scrape (default 6 AM Pacific)
SCRAPE_CRON = os.getenv("SCRAPE_CRON", "0 6 * * *")
SCRAPE_ENABLED = os.getenv("SCRAPE_ENABLED", "true").lower() in ("true", "1", "yes")

# Email / SMTP — all optional; email disabled if SMTP_HOST not set
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM") or os.getenv("SMTP_USER") or ""
NOTIFY_EMAILS = [e.strip() for e in os.getenv("NOTIFY_EMAILS", "").split(",") if e.strip()]
