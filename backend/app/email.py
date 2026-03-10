"""Email notifications for scrape results.

Sends via SMTP (async with aiosmtplib). Silently skips if SMTP is not configured.
"""

import logging
from datetime import date
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import NOTIFY_EMAILS, SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USER

logger = logging.getLogger(__name__)


def _is_configured() -> bool:
    return bool(SMTP_HOST and NOTIFY_EMAILS)


async def _send_email(subject: str, body_html: str, recipients: list[str]) -> None:
    """Send an email via SMTP. Skips silently if not configured."""
    if not _is_configured():
        return

    try:
        import aiosmtplib
    except ImportError:
        logger.warning("aiosmtplib not installed — skipping email")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = ", ".join(recipients)
    msg.attach(MIMEText(body_html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            username=SMTP_USER or None,
            password=SMTP_PASSWORD or None,
            start_tls=True,
        )
        logger.info("Email sent: %s -> %s", subject, recipients)
    except Exception as exc:
        logger.error("Failed to send email: %s", exc)


async def send_daily_digest(job: dict) -> None:
    """Send a summary of the scrape job results."""
    if not _is_configured():
        return

    today = date.today().strftime("%B %d, %Y").replace(" 0", " ")
    subject = f"CA Town Hall Monitor \u2014 Scrape Report {today}"

    total = job.get("total", 0)
    success = job.get("success", 0)
    no_events = job.get("no_events", 0)
    failed = job.get("failed", 0)
    ai_used = job.get("ai_used", 0)
    ai_cost = round(job.get("ai_total_cost", 0), 4)
    past_removed = job.get("past_events_removed", 0)

    body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3C3B6E; border-bottom: 2px solid #B22234; padding-bottom: 8px;">
            Scrape Report &mdash; {today}
        </h2>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Total legislators</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">{total}</td>
            </tr>
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee; color: #03543F;"><strong>Success</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; color: #03543F;">{success}</td>
            </tr>
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee; color: #92400E;"><strong>No events</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; color: #92400E;">{no_events}</td>
            </tr>
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee; color: #9B1C1C;"><strong>Failed</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right; color: #9B1C1C;">{failed}</td>
            </tr>
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>AI-assisted</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">{ai_used} (${ai_cost})</td>
            </tr>
            <tr>
                <td style="padding: 8px;"><strong>Past events removed</strong></td>
                <td style="padding: 8px; text-align: right;">{past_removed}</td>
            </tr>
        </table>
        <p style="color: #6B7280; font-size: 12px;">
            Automated report from CA Town Hall Monitor.
        </p>
    </div>
    """

    await _send_email(subject, body, NOTIFY_EMAILS)


async def send_failure_alert(job: dict) -> None:
    """Send an alert when failure rate exceeds 20%."""
    if not _is_configured():
        return

    today = date.today().strftime("%B %d, %Y").replace(" 0", " ")
    subject = "CA Town Hall Monitor \u2014 High Failure Rate Alert"

    total = job.get("total", 0)
    failed = job.get("failed", 0)
    rate = round(failed / max(total, 1) * 100, 1)

    body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #9B1C1C; border-bottom: 2px solid #B22234; padding-bottom: 8px;">
            High Failure Rate Alert
        </h2>
        <p>The scrape completed on <strong>{today}</strong> with a failure rate of <strong>{rate}%</strong>.</p>
        <ul>
            <li>Total legislators: {total}</li>
            <li>Failed: <strong style="color: #9B1C1C;">{failed}</strong></li>
            <li>Success: {job.get("success", 0)}</li>
        </ul>
        <p>Please check the <a href="#">Status Page</a> for details on failing legislators.</p>
        <p style="color: #6B7280; font-size: 12px;">
            Automated alert from CA Town Hall Monitor.
        </p>
    </div>
    """

    await _send_email(subject, body, NOTIFY_EMAILS)
