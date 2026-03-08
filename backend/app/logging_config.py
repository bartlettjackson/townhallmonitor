"""Structured JSON logging configuration."""

import json
import logging
import os
import sys
from datetime import datetime, timezone


class JSONFormatter(logging.Formatter):
    """Outputs log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Include optional extra fields when present
        for key in (
            "legislator_id",
            "legislator_name",
            "url",
            "method",
            "status",
            "cost_usd",
        ):
            val = getattr(record, key, None)
            if val is not None:
                log_entry[key] = val

        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, default=str)


def setup_logging() -> None:
    """Configure root logger based on LOG_FORMAT env var.

    LOG_FORMAT=json (default) — structured JSON to stdout
    LOG_FORMAT=text — human-readable for local dev
    """
    log_format = os.getenv("LOG_FORMAT", "json").lower()
    level = os.getenv("LOG_LEVEL", "INFO").upper()

    root = logging.getLogger()
    root.setLevel(level)

    # Remove any existing handlers
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)

    if log_format == "json":
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)-8s %(name)s — %(message)s")
        )

    root.addHandler(handler)

    # Quiet noisy libraries
    for name in ("httpx", "httpcore", "playwright"):
        logging.getLogger(name).setLevel(logging.WARNING)
