# California Legislative Town Hall Tracker

Track and aggregate town hall events hosted by California state legislators.

## Prerequisites

- [Homebrew](https://brew.sh)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for PostgreSQL)
- Poetry and Node.js (installed via Homebrew)

```sh
brew install poetry node
```

## Setup

### 1. Start PostgreSQL

```sh
docker compose up -d
```

### 2. Backend

```sh
cd backend
cp .env.example .env   # edit with your keys
poetry install
alembic upgrade head
poetry run uvicorn app.main:app --reload
```

Backend runs at http://localhost:8000

### 3. Frontend

```sh
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Frontend runs at http://localhost:3000
