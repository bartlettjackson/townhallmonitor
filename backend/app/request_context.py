"""Per-request context: request ID and helpers for security logging."""

import hashlib
import uuid
from contextvars import ContextVar

# Stores a unique ID for each request, propagated through async call chains.
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


def generate_request_id() -> str:
    return uuid.uuid4().hex[:12]


def mask_email(email: str) -> str:
    """Mask email for safe logging: 'user@example.com' -> 'us***@ex***.com'.

    Keeps first 2 chars of local part and first 2 chars of domain,
    plus the TLD, so it's identifiable but not reversible from logs.
    """
    if "@" not in email:
        return "***"
    local, domain = email.rsplit("@", 1)
    masked_local = local[:2] + "***" if len(local) > 2 else "***"
    parts = domain.rsplit(".", 1)
    if len(parts) == 2:
        masked_domain = parts[0][:2] + "***." + parts[1]
    else:
        masked_domain = domain[:2] + "***"
    return f"{masked_local}@{masked_domain}"
