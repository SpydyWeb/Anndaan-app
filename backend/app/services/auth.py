import uuid
from datetime import timedelta

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .. import schemas as S
from ..config import get_settings
from ..errors import AppError
from ..models import AuthSession, Ngo, OtpChallenge, User
from ..security import constant_eq, create_access_token, hmac_hash, new_refresh_token, numeric_code, utcnow
from . import sms
from .audit import audit


async def request_otp(session: AsyncSession, phone: str, ip: str | None) -> S.OtpRequestOut:
    s = get_settings()
    now = utcnow()
    hour_ago = now - timedelta(hours=1)
    last = await session.scalar(
        select(OtpChallenge.created_at).where(OtpChallenge.phone == phone).order_by(OtpChallenge.created_at.desc()).limit(1)
    )
    if last is not None and (now - last).total_seconds() < s.otp_resend_seconds:
        wait = int(s.otp_resend_seconds - (now - last).total_seconds()) + 1
        raise AppError(429, "otp_resend_wait", f"Wait {wait} seconds before asking for a new code.", {"retry_after": wait})
    per_phone = await session.scalar(
        select(func.count()).where(OtpChallenge.phone == phone, OtpChallenge.created_at > hour_ago)
    )
    if per_phone >= s.otp_max_per_phone_per_hour:
        raise AppError(429, "otp_limit", "Too many codes for this number. Try again in an hour.")
    if ip:
        per_ip = await session.scalar(
            select(func.count()).where(OtpChallenge.ip == ip, OtpChallenge.created_at > hour_ago)
        )
        if per_ip >= s.otp_max_per_ip_per_hour:
            raise AppError(429, "otp_limit", "Too many codes requested. Try again later.")

    code = numeric_code(s.otp_length)
    session.add(
        OtpChallenge(phone=phone, code_hash=hmac_hash(f"{phone}:{code}"), expires_at=now + timedelta(seconds=s.otp_ttl_seconds), ip=ip)
    )
    await session.flush()
    try:
        await sms.send_otp(phone, code)
    except sms.SmsError:
        await session.rollback()
        raise AppError(502, "sms_failed", "We could not send the SMS. Try again in a moment.")
    await session.commit()
    return S.OtpRequestOut(
        phone=phone,
        expires_in_seconds=s.otp_ttl_seconds,
        resend_after_seconds=s.otp_resend_seconds,
        dev_code=code if s.otp_dev_mode else None,
    )


async def me_out(session: AsyncSession, user: User) -> S.MeOut:
    ngo = await session.scalar(select(Ngo).where(Ngo.owner_id == user.id))
    out = S.MeOut.model_validate(user)
    out.ngo = S.NgoBrief(id=ngo.id, name=ngo.name, status=ngo.status) if ngo else None
    return out


async def _issue(session: AsyncSession, user: User, family: uuid.UUID, ua: str | None, ip: str | None) -> tuple[str, str, object]:
    refresh = new_refresh_token()
    session.add(
        AuthSession(
            user_id=user.id,
            family_id=family,
            token_hash=hmac_hash(refresh),
            expires_at=utcnow() + timedelta(days=get_settings().refresh_token_days),
            user_agent=(ua or "")[:256] or None,
            ip=ip,
        )
    )
    access, exp = create_access_token(user.id, user.role)
    return access, refresh, exp


async def verify_otp(session: AsyncSession, data: S.OtpVerifyIn, ua: str | None, ip: str | None) -> S.TokenPair:
    s = get_settings()
    now = utcnow()
    ch = await session.scalar(
        select(OtpChallenge)
        .where(OtpChallenge.phone == data.phone, OtpChallenge.consumed_at.is_(None), OtpChallenge.expires_at > now)
        .order_by(OtpChallenge.created_at.desc())
        .limit(1)
        .with_for_update()
    )
    if ch is None:
        raise AppError(400, "otp_expired", "This code has expired. Ask for a new one.")
    if ch.attempts >= s.otp_max_attempts:
        raise AppError(429, "otp_too_many_attempts", "Too many wrong codes. Ask for a new one.")
    ch.attempts += 1
    if not constant_eq(ch.code_hash, hmac_hash(f"{data.phone}:{data.code}")):
        await session.commit()
        left = s.otp_max_attempts - ch.attempts
        raise AppError(400, "otp_wrong", "That code is not right.", {"attempts_left": left})
    ch.consumed_at = now

    user = await session.scalar(select(User).where(User.phone == data.phone).with_for_update())
    is_new = user is None
    if is_new:
        user = User(id=uuid.uuid4(), phone=data.phone, name=data.name, phone_verified_at=now)
        session.add(user)
        await session.flush()
        audit(session, "user.register", "user", user.id, user.id, ip)
    else:
        if user.status != "active":
            await session.commit()
            raise AppError(403, "account_suspended", "This account is suspended. Contact Anndaan support.")
        if data.name and not user.name:
            user.name = data.name
        user.phone_verified_at = user.phone_verified_at or now
    user.last_seen_at = now
    if user.phone in s.admin_phones and user.role != "admin":
        user.role = "admin"
        audit(session, "user.promote_admin", "user", user.id, user.id, ip, via="ADMIN_PHONES")
    access, refresh, exp = await _issue(session, user, uuid.uuid4(), ua, ip)
    audit(session, "auth.login", "user", user.id, user.id, ip)
    await session.commit()
    await session.refresh(user)
    return S.TokenPair(
        access_token=access, access_expires_at=exp, refresh_token=refresh, user=await me_out(session, user), is_new_user=is_new
    )


async def refresh(session: AsyncSession, token: str, ua: str | None, ip: str | None) -> S.TokenPair:
    row = await session.scalar(
        select(AuthSession).where(AuthSession.token_hash == hmac_hash(token)).with_for_update()
    )
    now = utcnow()
    if row is None:
        raise AppError(401, "invalid_refresh", "Please sign in again.")
    if row.rotated_at is not None or row.revoked_at is not None:
        # A rotated token was presented again: assume it was stolen and end every session in the family.
        await session.execute(
            update(AuthSession)
            .where(AuthSession.family_id == row.family_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        audit(session, "auth.refresh_reuse", "user", row.user_id, row.user_id, ip)
        await session.commit()
        raise AppError(401, "invalid_refresh", "Please sign in again.")
    if row.expires_at <= now:
        raise AppError(401, "invalid_refresh", "Please sign in again.")
    user = await session.get(User, row.user_id)
    if user is None or user.status != "active":
        raise AppError(403, "account_suspended", "This account is suspended. Contact Anndaan support.")
    row.rotated_at = now
    user.last_seen_at = now
    access, new_refresh, exp = await _issue(session, user, row.family_id, ua, ip)
    await session.commit()
    return S.TokenPair(access_token=access, access_expires_at=exp, refresh_token=new_refresh, user=await me_out(session, user))


async def logout(session: AsyncSession, token: str) -> None:
    row = await session.scalar(select(AuthSession).where(AuthSession.token_hash == hmac_hash(token)))
    if row is not None:
        await session.execute(
            update(AuthSession)
            .where(AuthSession.family_id == row.family_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=utcnow())
        )
        await session.commit()
