import uuid
from typing import Annotated

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .db import get_session
from .errors import AppError
from .models import User
from .security import decode_access_token

Session = Annotated[AsyncSession, Depends(get_session)]
_bearer = HTTPBearer(auto_error=False)


def client_ip(request: Request) -> str | None:
    if get_settings().trust_proxy_headers:
        # Caddy appends the real peer address; earlier entries are client-supplied and spoofable.
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[-1].strip()
    return request.client.host if request.client else None


async def _user_from_token(session: AsyncSession, creds: HTTPAuthorizationCredentials | None) -> User | None:
    if creds is None:
        return None
    try:
        claims = decode_access_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise AppError(401, "token_expired", "Your session expired. Refresh and try again.")
    except jwt.InvalidTokenError:
        raise AppError(401, "invalid_token", "Invalid access token.")
    user = await session.get(User, uuid.UUID(claims["sub"]))
    if user is None:
        raise AppError(401, "invalid_token", "Invalid access token.")
    if user.status != "active":
        raise AppError(403, "account_suspended", "This account is suspended. Contact Anndaan support.")
    return user


async def optional_user(
    session: Session, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
) -> User | None:
    return await _user_from_token(session, creds)


async def current_user(
    session: Session, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
) -> User:
    user = await _user_from_token(session, creds)
    if user is None:
        raise AppError(401, "unauthorized", "Sign in with your mobile number to continue.")
    return user


async def admin_user(user: Annotated[User, Depends(current_user)]) -> User:
    if user.role != "admin":
        raise AppError(403, "forbidden", "Admins only.")
    return user


OptionalUser = Annotated[User | None, Depends(optional_user)]
CurrentUser = Annotated[User, Depends(current_user)]
AdminUser = Annotated[User, Depends(admin_user)]
