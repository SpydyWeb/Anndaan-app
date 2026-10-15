import asyncio
import contextlib
import logging

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from . import errors, jobs
from .api import admin, auth, listings, me, ngos, reservations, users
from .config import get_settings
from .db import engine
from .schemas import ErrorResponse
from .services.ratelimit import RateLimitMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@contextlib.asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    settings.validate_for_production()
    task = asyncio.create_task(jobs.loop()) if settings.run_jobs else None
    yield
    if task:
        task.cancel()
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Anndaan API",
        version="1.0.0",
        description="Share surplus cooked food with people and NGOs nearby.",
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url="/api/v1/openapi.json",
        responses={
            400: {"model": ErrorResponse},
            401: {"model": ErrorResponse},
            403: {"model": ErrorResponse},
            404: {"model": ErrorResponse},
            409: {"model": ErrorResponse},
            422: {"model": ErrorResponse},
            429: {"model": ErrorResponse},
        },
    )
    errors.install(app)
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        if request.url.path.startswith("/api/") and "cache-control" not in response.headers:
            response.headers["Cache-Control"] = "no-store"
        return response

    v1 = APIRouter(prefix="/api/v1")
    for r in (auth.router, me.router, listings.router, reservations.router, users.router, ngos.router, admin.router):
        v1.include_router(r)

    @v1.get("/health", tags=["health"])
    async def health() -> dict[str, str]:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ok"}

    app.include_router(v1)
    return app


app = create_app()
