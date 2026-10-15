"""Per-IP fixed-window limiter for the whole API.

In-process memory is enough for one VPS. OTP limits (the abuse-sensitive ones, since
each OTP costs an SMS) are enforced separately from database rows, so they hold across
restarts and multiple workers."""

import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from ..config import get_settings
from ..deps import client_ip


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.hits: dict[tuple[str, int], int] = defaultdict(int)
        self.window = -1

    async def dispatch(self, request: Request, call_next):
        limit = get_settings().rate_limit_per_minute
        if limit <= 0 or request.url.path in ("/health", "/api/v1/health"):
            return await call_next(request)
        minute = int(time.time() // 60)
        if minute != self.window:
            self.hits.clear()
            self.window = minute
        key = (client_ip(request) or "?", minute)
        self.hits[key] += 1
        if self.hits[key] > limit:
            return JSONResponse(
                {"error": {"code": "rate_limited", "message": "Too many requests. Wait a minute.", "details": None}},
                status_code=429,
                headers={"Retry-After": "60"},
            )
        return await call_next(request)
