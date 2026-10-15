"""Operational commands.

    python -m app.cli create-admin +919811012345 "Asha Admin"
    python -m app.cli run-jobs
    python -m app.cli export-openapi ../openapi.json
"""

import asyncio
import json
import sys

from sqlalchemy import select

from .db import SessionLocal, engine
from .models import User
from .schemas import normalize_phone
from .security import utcnow


async def create_admin(phone: str, name: str) -> None:
    phone = normalize_phone(phone)
    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.phone == phone))
        if user is None:
            user = User(phone=phone, name=name, phone_verified_at=utcnow())
            session.add(user)
        user.role = "admin"
        user.status = "active"
        await session.commit()
        print(f"{phone} is now an admin. Sign in to the dashboard with an SMS code.")
    await engine.dispose()


async def run_jobs() -> None:
    from .jobs import run_once

    print(await run_once())
    await engine.dispose()


def export_openapi(path: str) -> None:
    from .main import app

    with open(path, "w", encoding="utf-8") as f:
        json.dump(app.openapi(), f, indent=1, ensure_ascii=False)
    print(f"wrote {path}")


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    cmd = args[0]
    if cmd == "create-admin" and len(args) >= 2:
        asyncio.run(create_admin(args[1], args[2] if len(args) > 2 else "Admin"))
    elif cmd == "run-jobs":
        asyncio.run(run_jobs())
    elif cmd == "export-openapi":
        export_openapi(args[1] if len(args) > 1 else "openapi.json")
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
