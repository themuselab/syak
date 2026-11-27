"""Shared source gate for GitHub's partner event/detail jobs."""
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import math
import os
from pathlib import Path
import tempfile

from slot_ingest import api_get, api_post

STATUSES = (401,403,429,503)


class PartnerSourcePaused(RuntimeError):
    pass


def enabled():
    return os.environ.get("PARTNER_SOURCE_GUARD") == "1"


def marker():
    return Path(os.environ.get("RUNNER_TEMP") or tempfile.gettempdir()) / "syak-partner-source-held"


def check():
    if not enabled():
        return
    if marker().exists():
        raise PartnerSourcePaused("source restriction already observed in this runner")
    state = api_get("/internal/shops/source-backoff", tries=2)
    if type(state.get("manualHold")) is not bool or "untilAt" not in state:
        raise RuntimeError("Shared source state is unavailable")
    until = datetime.fromisoformat(state["untilAt"].replace("Z","+00:00")) if state["untilAt"] else None
    if state["manualHold"] or (until and until > datetime.now(timezone.utc)):
        raise PartnerSourcePaused("the shared source restriction is active")


def record(status, retry_after=None):
    if not enabled() or status not in STATUSES:
        return
    marker().touch(mode=0o600)
    seconds = None
    if retry_after and retry_after.isdecimal():
        seconds = min(2_147_483_647, int(retry_after))
    elif retry_after:
        try:
            seconds = max(0, min(2_147_483_647, math.ceil(
                (parsedate_to_datetime(retry_after)-datetime.now(timezone.utc)).total_seconds())))
        except (ValueError, TypeError, OverflowError):
            pass
    payload = {"status":status}
    if seconds is not None:
        payload["retryAfterSeconds"] = seconds
    api_post("/internal/shops/source-backoff", payload, tries=2)
    raise PartnerSourcePaused("upstream returned HTTP " + str(status))
