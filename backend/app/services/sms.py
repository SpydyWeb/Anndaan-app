"""SMS delivery. Used only for OTPs and NGO verification results, to keep costs low.

`console` logs messages (development). `msg91` uses MSG91's OTP and Flow APIs; in India,
SMS needs DLT-registered templates, so template IDs are configuration, not code."""

import logging

import httpx

from ..config import get_settings

log = logging.getLogger("annadaan.sms")


class SmsError(Exception):
    pass


async def send_otp(phone: str, code: str) -> None:
    s = get_settings()
    if s.sms_provider == "console":
        log.warning("DEV OTP for %s: %s", phone, code)
        return
    if s.sms_provider == "msg91":
        if not (s.msg91_auth_key and s.msg91_otp_template_id):
            raise SmsError("MSG91 is not configured")
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://control.msg91.com/api/v5/otp",
                params={"template_id": s.msg91_otp_template_id, "mobile": phone.lstrip("+"), "otp": code},
                headers={"authkey": s.msg91_auth_key, "Content-Type": "application/json"},
                json={},
            )
        if resp.status_code != 200 or resp.json().get("type") != "success":
            log.error("MSG91 OTP failed: %s %s", resp.status_code, resp.text[:200])
            raise SmsError("SMS provider rejected the request")
        return
    raise SmsError(f"Unknown SMS provider {s.sms_provider}")


async def send_text(phone: str, variables: dict[str, str]) -> None:
    """Transactional SMS through a pre-approved MSG91 Flow template. Best-effort."""
    s = get_settings()
    if s.sms_provider == "console" or not s.msg91_flow_template_id:
        log.info("SMS to %s: %s", phone, variables)
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                "https://control.msg91.com/api/v5/flow",
                headers={"authkey": s.msg91_auth_key, "Content-Type": "application/json"},
                json={
                    "template_id": s.msg91_flow_template_id,
                    "recipients": [{"mobiles": phone.lstrip("+"), **variables}],
                },
            )
    except httpx.HTTPError:
        log.exception("transactional SMS failed")
