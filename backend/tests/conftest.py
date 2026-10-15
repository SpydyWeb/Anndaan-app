import os
import tempfile

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres@127.0.0.1:5433/annadaan_test")
os.environ["ENVIRONMENT"] = "test"
os.environ["RUN_JOBS"] = "false"
os.environ["RATE_LIMIT_PER_MINUTE"] = "0"
os.environ["OTP_DEV_MODE"] = "true"
os.environ["SMS_PROVIDER"] = "console"
os.environ["OTP_MAX_PER_IP_PER_HOUR"] = "100000"
os.environ["UPLOAD_DIR"] = tempfile.mkdtemp(prefix="annadaan-test-")

import itertools  # noqa: E402
from datetime import UTC, datetime, timedelta  # noqa: E402

import httpx  # noqa: E402
import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402

HERE = os.path.dirname(os.path.dirname(__file__))
DELHI = (28.7041, 77.1025)  # Rohini-ish
_phones = itertools.count(9000000001)


@pytest.fixture(scope="session", autouse=True)
def migrated():
    cfg = Config(os.path.join(HERE, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(HERE, "alembic"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
async def clean_db(migrated):
    async with engine.begin() as conn:
        tables = (
            await conn.execute(
                text(
                    "SELECT tablename FROM pg_tables WHERE schemaname='public' "
                    "AND tablename NOT IN ('alembic_version','spatial_ref_sys')"
                )
            )
        ).scalars().all()
        await conn.execute(text(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test/api/v1") as c:
        yield c


def new_phone() -> str:
    return f"+91{next(_phones)}"


async def login(client: httpx.AsyncClient, name: str | None = "Test User", phone: str | None = None) -> dict:
    phone = phone or new_phone()
    r = await client.post("/auth/otp/request", json={"phone": phone})
    assert r.status_code == 200, r.text
    code = r.json()["dev_code"]
    r = await client.post("/auth/otp/verify", json={"phone": phone, "code": code, "name": name})
    assert r.status_code == 200, r.text
    data = r.json()
    data["headers"] = {"Authorization": f"Bearer {data['access_token']}"}
    data["phone"] = phone
    return data


def in_hours(h: float) -> str:
    return (datetime.now(UTC) + timedelta(hours=h)).isoformat()


async def post_food(client, user, **over) -> dict:
    body = {
        "food_type": "veg",
        "servings": 4,
        "good_until": in_hours(4),
        "pickup_method": "door",
        "address": "Flat 204, Tower B, Shanti Apartments, Sector 15",
        "area": "Sector 15, Rohini",
        "lat": DELHI[0],
        "lng": DELHI[1],
    }
    body.update(over)
    r = await client.post("/listings", json=body, headers=user["headers"])
    assert r.status_code == 201, r.text
    return r.json()


async def make_admin(user: dict) -> None:
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE users SET role='admin' WHERE id=:id"), {"id": user["user"]["id"]})


async def sql(statement: str, **params):
    async with engine.begin() as conn:
        return await conn.execute(text(statement), params)
