from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/townhall_db",
)
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
AUTH_SECRET_KEY = os.getenv("AUTH_SECRET_KEY", "change-me")
