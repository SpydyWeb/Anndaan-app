from fastapi import APIRouter, Request, Response

from .. import schemas as S
from ..deps import Session, client_ip
from ..services import auth

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/otp/request", response_model=S.OtpRequestOut)
async def request_otp(body: S.OtpRequestIn, session: Session, request: Request):
    """Send a one-time code by SMS. Limited per number and per IP."""
    return await auth.request_otp(session, body.phone, client_ip(request))


@router.post("/otp/verify", response_model=S.TokenPair)
async def verify_otp(body: S.OtpVerifyIn, session: Session, request: Request):
    """Check the code. Creates the account on first use, then returns tokens."""
    return await auth.verify_otp(session, body, request.headers.get("user-agent"), client_ip(request))


@router.post("/refresh", response_model=S.TokenPair)
async def refresh(body: S.RefreshIn, session: Session, request: Request):
    """Swap a refresh token for a new pair. Each refresh token works once."""
    return await auth.refresh(session, body.refresh_token, request.headers.get("user-agent"), client_ip(request))


@router.post("/logout", status_code=204)
async def logout(body: S.RefreshIn, session: Session):
    await auth.logout(session, body.refresh_token)
    return Response(status_code=204)
