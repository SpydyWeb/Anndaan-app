import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt

from .config import get_settings


def utcnow() -> datetime:
    return datetime.now(UTC)


def hmac_hash(value: str) -> str:
    """Keyed hash for OTPs and refresh tokens: a database leak alone cannot replay them."""
    key = get_settings().jwt_secret.encode()
    return hmac.new(key, value.encode(), hashlib.sha256).hexdigest()


def constant_eq(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def numeric_code(length: int) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def create_access_token(user_id: uuid.UUID, role: str) -> tuple[str, datetime]:
    s = get_settings()
    now = utcnow()
    exp = now + timedelta(minutes=s.access_token_minutes)
    token = jwt.encode(
        {"sub": str(user_id), "role": role, "iat": now, "exp": exp, "iss": s.jwt_issuer, "typ": "access"},
        s.jwt_secret,
        algorithm="HS256",
    )
    return token, exp


def decode_access_token(token: str) -> dict:
    s = get_settings()
    claims = jwt.decode(
        token,
        s.jwt_secret,
        algorithms=["HS256"],
        issuer=s.jwt_issuer,
        options={"require": ["exp", "sub", "iss"]},
    )
    if claims.get("typ") != "access":
        raise jwt.InvalidTokenError("wrong token type")
    return claims
