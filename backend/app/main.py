import io
import logging
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from pydantic import BaseModel
from sqlalchemy import Integer, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.auth import (
    create_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.config import ALLOWED_ORIGINS, INVITE_CODE, SCRAPE_CRON, SCRAPE_ENABLED
from app.database import get_session
from app.models.event import Event
from app.models.legislator import Legislator
from app.models.scrape_log import ScrapeLog
from app.models.user import User
from app.scrape_runner import get_job, run_full_scrape, run_single_scrape

logger = logging.getLogger(__name__)

PACIFIC = ZoneInfo("America/Los_Angeles")


def _to_pacific_iso(dt_val: datetime | None) -> str | None:
    """Convert a naive-UTC datetime to a Pacific-timezone ISO string."""
    if dt_val is None:
        return None
    aware = dt_val.replace(tzinfo=timezone.utc)
    return aware.astimezone(PACIFIC).isoformat()


def _today_pacific() -> str:
    """Return today's date in Pacific timezone as YYYY-MM-DD."""
    return datetime.now(PACIFIC).strftime("%Y-%m-%d")


scheduler = AsyncIOScheduler()


async def scheduled_scrape():
    logger.info("Scheduled scrape triggered")
    await run_full_scrape()


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.logging_config import setup_logging

    setup_logging()

    if SCRAPE_ENABLED and SCRAPE_CRON:
        parts = SCRAPE_CRON.split()
        if len(parts) == 5:
            trigger = CronTrigger(
                minute=parts[0],
                hour=parts[1],
                day=parts[2],
                month=parts[3],
                day_of_week=parts[4],
                timezone="US/Pacific",
            )
            scheduler.add_job(scheduled_scrape, trigger, id="daily_scrape", replace_existing=True)
            scheduler.start()
            logger.info("Scheduled scrape: %s Pacific", SCRAPE_CRON)
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)


app = FastAPI(title="CA Town Hall Tracker", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Health (public)
# ---------------------------------------------------------------------------


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str
    invite_code: str


@app.post("/api/auth/login")
async def login(body: LoginRequest, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user.id, user.email)
    return {"token": token, "user": {"id": user.id, "email": user.email, "name": user.name}}


@app.post("/api/auth/register")
async def register(body: RegisterRequest, session: AsyncSession = Depends(get_session)):
    if body.invite_code != INVITE_CODE:
        raise HTTPException(status_code=403, detail="Invalid invite code")

    existing = await session.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        name=body.name,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    token = create_token(user.id, user.email)
    return {"token": token, "user": {"id": user.id, "email": user.email, "name": user.name}}


@app.get("/api/auth/me")
async def me(user: User = Depends(get_current_user)):
    return {"id": user.id, "email": user.email, "name": user.name}


# ---------------------------------------------------------------------------
# Legislators (protected)
# ---------------------------------------------------------------------------


@app.post("/api/legislators/seed")
async def seed_legislators_endpoint(_user: User = Depends(get_current_user)):
    from scripts.seed_legislators import seed_legislators

    return await seed_legislators()


@app.get("/api/legislators")
async def list_legislators(
    _user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Legislator).order_by(Legislator.chamber, cast(Legislator.district, Integer))
    )
    legislators = result.scalars().all()
    return [_legislator_dict(leg) for leg in legislators]


def _legislator_dict(leg: Legislator) -> dict:
    facebook_flag = leg.facebook_url is not None and leg.scrape_status in (
        None,
        "no_events",
        "failed",
    )
    return {
        "id": leg.id,
        "name": leg.name,
        "chamber": leg.chamber,
        "district": leg.district,
        "party": leg.party,
        "official_website": leg.official_website,
        "campaign_website": leg.campaign_website,
        "facebook_url": leg.facebook_url,
        "last_scraped_at": _to_pacific_iso(leg.last_scraped_at),
        "scrape_status": leg.scrape_status,
        "facebook_flag": facebook_flag,
        "facebook_note": ("Events may only be posted on Facebook" if facebook_flag else None),
    }


# ---------------------------------------------------------------------------
# Scrape: run / status / logs (protected)
# ---------------------------------------------------------------------------


@app.post("/api/scrape/run")
async def trigger_scrape(_user: User = Depends(get_current_user)):
    job_id = await run_full_scrape()
    return {"job_id": job_id, "status": "running"}


@app.post("/api/scrape/run/{legislator_id}")
async def trigger_single_scrape(
    legislator_id: int,
    _user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    leg = await session.get(Legislator, legislator_id)
    if not leg:
        raise HTTPException(status_code=404, detail="Legislator not found")
    job_id = await run_single_scrape(legislator_id)
    return {"job_id": job_id, "status": "running", "legislator": leg.name}


@app.get("/api/scrape/status/{job_id}")
async def scrape_status(job_id: str, _user: User = Depends(get_current_user)):
    job = get_job(job_id)
    if not job:
        return {"error": "Job not found or expired"}
    return {
        "id": job["id"],
        "status": job["status"],
        "started_at": _to_pacific_iso(job["started_at"]),
        "completed_at": _to_pacific_iso(job["completed_at"]),
        "total": job["total"],
        "completed_count": job["completed_count"],
        "success": job["success"],
        "no_events": job["no_events"],
        "failed": job["failed"],
        "ai_used": job["ai_used"],
        "ai_total_cost_usd": round(job["ai_total_cost"], 4),
        "past_events_removed": job["past_events_removed"],
    }


@app.get("/api/scrape/logs")
async def scrape_logs(
    limit: int = Query(50, ge=1, le=500),
    _user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    logs_q = (
        select(ScrapeLog)
        .options(joinedload(ScrapeLog.legislator))
        .order_by(ScrapeLog.completed_at.desc())
        .limit(limit)
    )
    logs_result = await session.execute(logs_q)
    logs = logs_result.scalars().unique().all()

    stats_q = select(
        func.count().label("total"),
        func.count().filter(ScrapeLog.status == "success").label("success"),
        func.count().filter(ScrapeLog.status == "no_events").label("no_events"),
        func.count().filter(ScrapeLog.status == "failed").label("failed"),
        func.count().filter(ScrapeLog.method_used == "ai").label("ai_used"),
    )
    stats_result = await session.execute(stats_q)
    stats = stats_result.one()

    return {
        "summary": {
            "total_logs": stats.total,
            "success": stats.success,
            "no_events": stats.no_events,
            "failed": stats.failed,
            "ai_used": stats.ai_used,
        },
        "logs": [
            {
                "id": log.id,
                "legislator_name": log.legislator.name if log.legislator else None,
                "legislator_id": log.legislator_id,
                "started_at": _to_pacific_iso(log.started_at),
                "completed_at": _to_pacific_iso(log.completed_at),
                "status": log.status,
                "method_used": log.method_used,
                "error_message": log.error_message,
            }
            for log in logs
        ],
    }


# ---------------------------------------------------------------------------
# Scrape: failures (protected)
# ---------------------------------------------------------------------------


@app.get("/api/scrape/failures")
async def scrape_failures(
    _user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Legislator)
        .where(Legislator.consecutive_failures >= 3)
        .order_by(Legislator.consecutive_failures.desc())
    )
    legislators = result.scalars().all()

    failures = []
    for leg in legislators:
        # Get the most recent scrape log for error context
        log_result = await session.execute(
            select(ScrapeLog)
            .where(ScrapeLog.legislator_id == leg.id)
            .order_by(ScrapeLog.completed_at.desc())
            .limit(1)
        )
        last_log = log_result.scalar_one_or_none()

        failures.append(
            {
                "id": leg.id,
                "name": leg.name,
                "chamber": leg.chamber,
                "district": leg.district,
                "official_website": leg.official_website,
                "consecutive_failures": leg.consecutive_failures,
                "circuit_open_until": _to_pacific_iso(leg.circuit_open_until),
                "last_error": last_log.error_message if last_log else None,
                "last_attempt": _to_pacific_iso(last_log.completed_at) if last_log else None,
            }
        )

    return failures


# ---------------------------------------------------------------------------
# Scrape: summary (protected)
# ---------------------------------------------------------------------------


@app.get("/api/scrape/summary")
async def scrape_summary(
    _user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    # Get the most recent completed scrape log to determine last scrape time
    last_log_q = select(ScrapeLog).order_by(ScrapeLog.completed_at.desc()).limit(1)
    last_log_result = await session.execute(last_log_q)
    last_log = last_log_result.scalar_one_or_none()

    last_scrape_time = None
    duration_seconds = None
    if last_log and last_log.completed_at:
        last_scrape_time = _to_pacific_iso(last_log.completed_at)
        if last_log.started_at:
            duration_seconds = int((last_log.completed_at - last_log.started_at).total_seconds())

    # Count legislators
    leg_count_q = select(func.count()).select_from(Legislator)
    total_legislators = (await session.execute(leg_count_q)).scalar() or 0

    # Stats from most recent scrape logs (one per legislator)
    # Use a subquery to get the latest log per legislator
    latest_per_leg = (
        select(
            ScrapeLog.legislator_id,
            func.max(ScrapeLog.completed_at).label("max_completed"),
        )
        .group_by(ScrapeLog.legislator_id)
        .subquery()
    )

    latest_logs_q = select(ScrapeLog).join(
        latest_per_leg,
        (ScrapeLog.legislator_id == latest_per_leg.c.legislator_id)
        & (ScrapeLog.completed_at == latest_per_leg.c.max_completed),
    )
    latest_result = await session.execute(latest_logs_q)
    latest_logs = latest_result.scalars().all()

    success_count = sum(1 for sl in latest_logs if sl.status == "success")
    no_events_count = sum(1 for sl in latest_logs if sl.status == "no_events")
    failed_count = sum(1 for sl in latest_logs if sl.status == "failed")
    skipped_count = sum(1 for sl in latest_logs if sl.status == "skipped")
    ai_count = sum(1 for sl in latest_logs if sl.method_used == "ai")

    # Get legislators for chamber info
    leg_result = await session.execute(select(Legislator))
    all_legs = {lg.id: lg for lg in leg_result.scalars().all()}

    def _chamber_count(status: str, chamber: str) -> int:
        return sum(
            1
            for sl in latest_logs
            if sl.status == status
            and sl.legislator_id in all_legs
            and all_legs[sl.legislator_id].chamber == chamber
        )

    assembly_success = _chamber_count("success", "assembly")
    assembly_failed = _chamber_count("failed", "assembly")
    senate_success = _chamber_count("success", "senate")
    senate_failed = _chamber_count("failed", "senate")

    # Failures (3+ consecutive)
    fail_result = await session.execute(
        select(Legislator)
        .where(Legislator.consecutive_failures >= 3)
        .order_by(Legislator.consecutive_failures.desc())
    )
    problem_legislators = fail_result.scalars().all()

    problem_list = []
    for leg in problem_legislators:
        log_r = await session.execute(
            select(ScrapeLog)
            .where(ScrapeLog.legislator_id == leg.id)
            .order_by(ScrapeLog.completed_at.desc())
            .limit(1)
        )
        last = log_r.scalar_one_or_none()
        problem_list.append(
            {
                "id": leg.id,
                "name": leg.name,
                "chamber": leg.chamber,
                "district": leg.district,
                "consecutive_failures": leg.consecutive_failures,
                "last_error": last.error_message if last else None,
                "last_attempt": _to_pacific_iso(last.completed_at) if last else None,
            }
        )

    return {
        "last_scrape_time": last_scrape_time,
        "duration_seconds": duration_seconds,
        "total_legislators": total_legislators,
        "success": success_count,
        "no_events": no_events_count,
        "failed": failed_count,
        "skipped": skipped_count,
        "ai_used": ai_count,
        "chamber_breakdown": {
            "assembly": {"success": assembly_success, "failed": assembly_failed},
            "senate": {"success": senate_success, "failed": senate_failed},
        },
        "problem_legislators": problem_list,
    }


# ---------------------------------------------------------------------------
# Events: list / export (protected)
# ---------------------------------------------------------------------------


def _build_events_query(
    chamber: str | None,
    start_date: str | None,
    end_date: str | None,
    event_type: str | None,
    search: str | None,
):
    """Shared query builder for list and export."""
    today_str = _today_pacific()

    q = (
        select(Event)
        .options(joinedload(Event.legislator))
        .where((Event.date >= today_str) | (Event.date.is_(None)))
    )

    if chamber and chamber != "all":
        q = q.join(Legislator).where(Legislator.chamber == chamber)
    else:
        q = q.join(Legislator)

    if start_date:
        q = q.where(Event.date >= start_date)
    if end_date:
        q = q.where(Event.date <= end_date)
    if event_type:
        q = q.where(Event.event_type == event_type)
    if search:
        pattern = f"%{search}%"
        q = q.where(
            Event.title.ilike(pattern)
            | Event.additional_details.ilike(pattern)
            | Event.address.ilike(pattern)
            | Legislator.name.ilike(pattern)
        )

    q = q.order_by(Event.date.asc(), Legislator.chamber, cast(Legislator.district, Integer))
    return q


@app.get("/api/events")
async def list_events(
    chamber: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    event_type: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(100, ge=1, le=500),
    _user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    q = _build_events_query(chamber, start_date, end_date, event_type, search)

    # Count total
    from sqlalchemy import func as sa_func

    count_q = select(sa_func.count()).select_from(q.subquery())
    total = (await session.execute(count_q)).scalar() or 0

    # Paginate
    offset = (page - 1) * per_page
    q = q.offset(offset).limit(per_page)
    result = await session.execute(q)
    events = result.scalars().unique().all()

    total_pages = max(1, -(-total // per_page))  # ceil division

    return {
        "events": [
            {
                "id": ev.id,
                "title": ev.title,
                "date": ev.date,
                "time": ev.time,
                "address": ev.address,
                "event_type": ev.event_type,
                "additional_details": ev.additional_details,
                "source_url": ev.source_url,
                "is_virtual": ev.is_virtual,
                "legislator_name": ev.legislator.name,
                "legislator_party": ev.legislator.party,
                "legislator_district": ev.legislator.district,
                "legislator_chamber": ev.legislator.chamber,
            }
            for ev in events
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
    }


def _format_date_human(date_str: str | None) -> str:
    """'2026-03-15' -> 'March 15, 2026'."""
    if not date_str:
        return ""
    try:
        d = date.fromisoformat(date_str)
        return d.strftime("%B %d, %Y").replace(" 0", " ")
    except ValueError:
        return date_str


def _format_time_human(time_str: str | None) -> str:
    """'18:00' -> '6:00 PM'."""
    if not time_str:
        return ""
    try:
        from datetime import datetime as dt

        t = dt.strptime(time_str, "%H:%M")
        return t.strftime("%I:%M %p").lstrip("0")
    except ValueError:
        return time_str


def _format_legislator_name(leg: Legislator) -> str:
    """Format as 'Assemblymember Jane Smith (D-42)' or 'Senator John Doe (R-15)'."""
    title = "Senator" if leg.chamber == "senate" else "Assemblymember"
    party_letter = leg.party[0] if leg.party else "?"
    return f"{title} {leg.name} ({party_letter}-{leg.district})"


@app.get("/api/events/export")
async def export_events(
    chamber: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    event_type: str | None = Query(None),
    search: str | None = Query(None),
    _user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    q = _build_events_query(chamber, start_date, end_date, event_type, search)
    result = await session.execute(q)
    events = result.scalars().unique().all()

    from openpyxl.styles import Font

    wb = Workbook()
    headers = ["NAME", "DATE", "TIME", "ADDRESS", "TITLE OF EVENT", "EVENT LINK", "ADDITIONAL DETAILS"]
    bold = Font(bold=True)

    assembly_events = [ev for ev in events if ev.legislator.chamber == "assembly"]
    senate_events = [ev for ev in events if ev.legislator.chamber == "senate"]

    def _fill_sheet(ws, ev_list):
        ws.append(headers)
        for cell in ws[1]:
            cell.font = bold
        for ev in ev_list:
            name = _format_legislator_name(ev.legislator)
            details_parts = [ev.event_type or "", ev.additional_details or ""]
            details = " — ".join(p for p in details_parts if p)
            ws.append(
                [
                    name,
                    _format_date_human(ev.date),
                    _format_time_human(ev.time),
                    ev.address,
                    ev.title,
                    ev.source_url,
                    details,
                ]
            )
        for col in ws.columns:
            max_len = 0
            col_letter = col[0].column_letter
            for cell in col:
                if cell.value:
                    max_len = max(max_len, len(str(cell.value)))
            ws.column_dimensions[col_letter].width = min(max_len + 2, 60)

    ws_assembly = wb.active
    ws_assembly.title = "Assembly"
    _fill_sheet(ws_assembly, assembly_events)

    ws_senate = wb.create_sheet("Senate")
    _fill_sheet(ws_senate, senate_events)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"ca_legislative_events_{_today_pacific()}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
