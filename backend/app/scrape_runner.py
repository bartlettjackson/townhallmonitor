"""Background scrape job runner.

Manages in-memory job state and runs the ScraperOrchestrator against all
legislators with bounded concurrency.
"""

import asyncio
import logging
import uuid
from datetime import date, datetime

from sqlalchemy import delete, select

from app.cache import cache_invalidate
from app.database import async_session
from app.models.event import Event
from app.models.legislator import Legislator
from app.scraper.orchestrator import ScraperOrchestrator

logger = logging.getLogger(__name__)

MAX_CONCURRENCY = 10

# In-memory job store (evicts after 30 minutes)
_jobs: dict[str, dict] = {}
_JOB_TTL_SECONDS = 1800


def _prune_jobs():
    now = datetime.utcnow()
    stale = [
        jid
        for jid, j in _jobs.items()
        if j["status"] == "completed"
        and (now - j["completed_at"]).total_seconds() > _JOB_TTL_SECONDS
    ]
    for jid in stale:
        del _jobs[jid]


def get_job(job_id: str) -> dict | None:
    _prune_jobs()
    return _jobs.get(job_id)


async def run_full_scrape() -> str:
    """Launch a full scrape of all legislators. Returns job_id immediately."""
    _prune_jobs()

    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "id": job_id,
        "status": "running",
        "started_at": datetime.utcnow(),
        "completed_at": None,
        "total": 0,
        "completed_count": 0,
        "success": 0,
        "no_events": 0,
        "failed": 0,
        "ai_used": 0,
        "ai_total_cost": 0.0,
        "past_events_removed": 0,
    }

    asyncio.create_task(_execute_scrape(job_id))
    return job_id


async def _execute_scrape(job_id: str):
    job = _jobs[job_id]
    try:
        # Load all legislators
        async with async_session() as session:
            result = await session.execute(select(Legislator))
            legislators = list(result.scalars().all())
            # Detach from session so they can be used across per-legislator sessions
            session.expunge_all()

        job["total"] = len(legislators)
        logger.info("Scrape job %s: starting for %d legislators", job_id, len(legislators))

        sem = asyncio.Semaphore(MAX_CONCURRENCY)

        async def scrape_one(leg: Legislator):
            async with sem:
                orch = ScraperOrchestrator()
                async with async_session() as sess:
                    # Re-attach legislator to this session
                    leg_in_session = await sess.get(Legislator, leg.id)
                    res = await orch.scrape_legislator(leg_in_session, sess)

                job["completed_count"] += 1
                if res.error:
                    job["failed"] += 1
                elif res.events:
                    job["success"] += 1
                else:
                    job["no_events"] += 1
                if res.method == "ai":
                    job["ai_used"] += 1
                if res.ai_cost:
                    job["ai_total_cost"] += res.ai_cost.get("total_cost_usd", 0)

        tasks = [scrape_one(leg) for leg in legislators]
        await asyncio.gather(*tasks, return_exceptions=True)

        # Remove past events — but only if at least one legislator succeeded.
        # If the entire run had zero successes (e.g. network outage), preserve
        # last known good data.
        if job["success"] > 0:
            removed = await _remove_past_events()
            job["past_events_removed"] = removed
        else:
            logger.warning("Scrape job %s had zero successes — skipping past event cleanup", job_id)

        # Invalidate caches so next request gets fresh data
        cache_invalidate("events")
        cache_invalidate("legislators")

        # Send email notifications
        try:
            from app.email import send_daily_digest, send_failure_alert

            await send_daily_digest(job)
            if job["failed"] / max(job["total"], 1) > 0.20:
                await send_failure_alert(job)
        except Exception as exc:
            logger.error("Email notification failed: %s", exc)

        job["status"] = "completed"
        logger.info(
            "Scrape job %s completed: %d success, %d no_events, %d failed",
            job_id,
            job["success"],
            job["no_events"],
            job["failed"],
        )

    except Exception as exc:
        logger.exception("Scrape job %s failed", job_id)
        job["status"] = "failed"
        job["error"] = str(exc)[:500]

    job["completed_at"] = datetime.utcnow()


async def run_single_scrape(legislator_id: int) -> str:
    """Launch a scrape for a single legislator. Returns job_id immediately."""
    _prune_jobs()

    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "id": job_id,
        "status": "running",
        "started_at": datetime.utcnow(),
        "completed_at": None,
        "total": 1,
        "completed_count": 0,
        "success": 0,
        "no_events": 0,
        "failed": 0,
        "ai_used": 0,
        "ai_total_cost": 0.0,
        "past_events_removed": 0,
    }

    asyncio.create_task(_execute_single_scrape(job_id, legislator_id))
    return job_id


async def _execute_single_scrape(job_id: str, legislator_id: int):
    job = _jobs[job_id]
    try:
        async with async_session() as session:
            leg = await session.get(Legislator, legislator_id)
            if not leg:
                job["status"] = "failed"
                job["error"] = f"Legislator {legislator_id} not found"
                job["completed_at"] = datetime.utcnow()
                return

            orch = ScraperOrchestrator()
            res = await orch.scrape_legislator(leg, session)

        job["completed_count"] = 1
        if res.error:
            job["failed"] = 1
        elif res.events:
            job["success"] = 1
        else:
            job["no_events"] = 1
        if res.method == "ai":
            job["ai_used"] = 1
        if res.ai_cost:
            job["ai_total_cost"] = res.ai_cost.get("total_cost_usd", 0)

        cache_invalidate("events")
        cache_invalidate("legislators")

        job["status"] = "completed"
        logger.info("Single scrape job %s for legislator %d completed", job_id, legislator_id)

    except Exception as exc:
        logger.exception("Single scrape job %s failed", job_id)
        job["status"] = "failed"
        job["error"] = str(exc)[:500]

    job["completed_at"] = datetime.utcnow()


async def _remove_past_events() -> int:
    """Delete events with dates in the past. Returns count removed."""
    today_str = date.today().isoformat()
    async with async_session() as session:
        # Only delete events that have a parseable date in the past.
        # Events with NULL date or unparseable date are kept.
        result = await session.execute(
            delete(Event)
            .where(Event.date.isnot(None))
            .where(Event.date < today_str)
            .returning(Event.id)
        )
        removed = len(result.all())
        await session.commit()
    return removed
