"""Scheduled work, run inside the API process every minute.

A Postgres advisory lock makes sure only one worker runs a pass, so this is safe with
several uvicorn workers. `python -m app.cli run-jobs` runs one pass from cron instead."""

import asyncio
import logging
from datetime import timedelta

from sqlalchemy import delete, text

from .config import get_settings
from .db import SessionLocal, engine
from .models import AuthSession, OtpChallenge
from .security import utcnow
from .services import food, ngo

log = logging.getLogger("annadaan.jobs")
LOCK_KEY = 4_271_001


async def run_once() -> dict | None:
    # The lock is held on its own connection for the whole pass; the work below commits
    # several times through pooled connections, which must not release it.
    async with engine.connect() as lock_conn:
        got = await lock_conn.scalar(text("SELECT pg_try_advisory_lock(:k)"), {"k": LOCK_KEY})
        await lock_conn.commit()
        if not got:
            return None
        try:
            async with SessionLocal() as session:
                counts = await food.run_expiry(session)
                counts["needs_closed"] = await ngo.close_finished_needs(session)
                now = utcnow()
                await session.execute(delete(OtpChallenge).where(OtpChallenge.created_at < now - timedelta(days=2)))
                await session.execute(delete(AuthSession).where(AuthSession.expires_at < now - timedelta(days=7)))
                await session.commit()
                return counts
        finally:
            await lock_conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": LOCK_KEY})
            await lock_conn.commit()


async def loop() -> None:
    interval = get_settings().job_interval_seconds
    while True:
        try:
            counts = await run_once()
            if counts and any(counts.values()):
                log.info("jobs: %s", counts)
        except Exception:
            log.exception("scheduled job failed")
        await asyncio.sleep(interval)
