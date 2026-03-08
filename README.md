# California Town Hall Tracker

Track and aggregate town hall events hosted by California state legislators. Scrapes official websites, campaign sites, and uses AI (Claude) as a fallback to extract constituent-facing events.

**Stack:** FastAPI + PostgreSQL (backend) · Next.js 14 + Tailwind (frontend) · Playwright + Claude API (scraping)

## Local Development

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for PostgreSQL)
- Python 3.11+ and [Poetry](https://python-poetry.org/)
- Node.js 18+ and npm

```sh
# macOS
brew install poetry node
```

### 1. Start PostgreSQL

```sh
docker compose up -d
```

### 2. Backend

```sh
cd backend
cp .env.example .env   # then edit with your real keys (see Environment Variables below)
poetry install
poetry run alembic upgrade head
poetry run uvicorn app.main:app --reload
```

Backend runs at **http://localhost:8000**. Verify: `curl http://localhost:8000/api/health`

#### Install Playwright browsers (needed for scraping)

```sh
cd backend
poetry run playwright install --with-deps chromium
```

### 3. Frontend

```sh
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Frontend runs at **http://localhost:3000**.

### 4. Create your first user

Visit http://localhost:3000/register and enter:

- Your name, email, and password
- The invite code from your `.env` file (`INVITE_CODE`)

Or via curl:

```sh
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your-password","name":"Your Name","invite_code":"your-team-invite-code"}'
```

### 5. Seed the legislator database

After logging in, seed all 120 California legislators:

```sh
TOKEN="<your-jwt-token-from-login>"
curl -X POST http://localhost:8000/api/legislators/seed \
  -H "Authorization: Bearer $TOKEN"
```

Or trigger it after logging into the app — the seed endpoint is available at `POST /api/legislators/seed`.

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string. Local default: `postgresql+asyncpg://postgres:postgres@localhost:5432/townhall_db` |
| `ANTHROPIC_API_KEY` | Yes | Claude API key for AI-powered event extraction. Get one at [console.anthropic.com](https://console.anthropic.com/) |
| `AUTH_SECRET_KEY` | Yes | Random secret for signing JWT tokens. Generate with: `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `INVITE_CODE` | Yes | Shared code for team member registration. Pick any phrase your team knows. |
| `ALLOWED_ORIGINS` | No | Comma-separated list of frontend URLs for CORS. Default: `http://localhost:3000` |
| `SCRAPE_CRON` | No | Cron schedule for automatic scrapes. Default: `0 6 * * *` (6 AM Pacific daily) |
| `SCRAPE_ENABLED` | No | Enable/disable the cron scheduler. Default: `true` |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|----------|----------|-------------|
| `API_URL` | Yes | Backend URL (server-side only, used by the API proxy). Local: `http://localhost:8000` |

### Getting a Claude API Key

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in
3. Navigate to **API Keys** in the sidebar
4. Click **Create Key**, give it a name, and copy the key
5. Add it to your backend `.env` as `ANTHROPIC_API_KEY`

The scraper uses Claude Sonnet as a fallback when pattern-based scraping fails. Cost is typically under $0.05 per full scrape run.

## Deployment

### Backend → Railway

1. Create a new project at [railway.app](https://railway.app/)

2. Add a **PostgreSQL** service (Railway Postgres plugin). Railway auto-sets `DATABASE_URL`.

3. Add a new service from your GitHub repo:
   - Set **Root Directory** to `backend`
   - Railway auto-detects the `Dockerfile`

4. Add these environment variables in the Railway service settings:

   | Variable | Value |
   |----------|-------|
   | `ANTHROPIC_API_KEY` | Your Claude API key |
   | `AUTH_SECRET_KEY` | A random secret (`python -c "import secrets; print(secrets.token_urlsafe(32))"`) |
   | `INVITE_CODE` | Your team invite code |
   | `ALLOWED_ORIGINS` | Your Vercel frontend URL, e.g. `https://ca-townhall-tracker.vercel.app` |
   | `SCRAPE_ENABLED` | `true` |

   `DATABASE_URL` is auto-injected by Railway's PostgreSQL plugin. The app auto-converts `postgres://` to `postgresql+asyncpg://`.

5. After the first deploy, run migrations. Open the Railway shell and run:

   ```sh
   alembic upgrade head
   ```

6. Seed legislators (one-time, after first deploy):

   ```sh
   # Register your first user
   curl -X POST https://your-backend.railway.app/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"you@example.com","password":"your-password","name":"Your Name","invite_code":"your-invite-code"}'

   # Use the returned token to seed
   curl -X POST https://your-backend.railway.app/api/legislators/seed \
     -H "Authorization: Bearer <token-from-register-response>"
   ```

### Frontend → Vercel

1. Import your GitHub repo at [vercel.com/new](https://vercel.com/new)

2. Set **Root Directory** to `frontend`

3. Framework Preset: **Next.js** (auto-detected)

4. Add this environment variable:

   | Variable | Value |
   |----------|-------|
   | `API_URL` | Your Railway backend URL, e.g. `https://your-backend.railway.app` |

5. Deploy. Vercel handles `npm install` and `next build` automatically.

### Post-Deployment Checklist

- [ ] Railway PostgreSQL is provisioned and `DATABASE_URL` is set
- [ ] `alembic upgrade head` has been run on Railway
- [ ] First user registered via `/api/auth/register`
- [ ] Legislators seeded via `POST /api/legislators/seed`
- [ ] `ALLOWED_ORIGINS` on Railway matches your Vercel URL
- [ ] `API_URL` on Vercel points to your Railway URL
- [ ] Visit your Vercel URL, log in, click **Generate New Report**

## Inviting Team Members

Share the **Invite Code** (the `INVITE_CODE` env var value) with your team. They can register at:

```
https://your-vercel-url.vercel.app/register
```

They'll need to enter the invite code during registration. No admin approval needed — anyone with the code can create an account.

To change the invite code, update the `INVITE_CODE` env var on Railway and redeploy.

## CI/CD

GitHub Actions runs on every push to `main` and on pull requests:

- **Backend:** Lints Python code with [ruff](https://docs.astral.sh/ruff/)
- **Frontend:** Runs ESLint and type-checks via `next build`

See `.github/workflows/ci.yml`.

## Architecture

```
Browser → Vercel (Next.js)
           ├── /login, /register     (public pages)
           ├── /                     (protected dashboard)
           └── /api/* → proxy → Railway (FastAPI)
                                  ├── /api/auth/*        (JWT auth)
                                  ├── /api/events/*      (event data)
                                  ├── /api/scrape/*      (scrape jobs)
                                  ├── /api/legislators/* (legislator data)
                                  └── PostgreSQL
```

The frontend proxies all API calls through Next.js route handlers, which read the auth token from an httpOnly cookie and forward it as a Bearer token to FastAPI. This keeps JWTs out of client-side JavaScript.
