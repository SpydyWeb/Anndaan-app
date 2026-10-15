"""In-app notifications with Expo push delivery.

Rows are written in the caller's transaction. After that transaction commits, the new
rows are pushed in the background, so a failed push never rolls back business state."""

import asyncio
import logging
import uuid

import httpx
from sqlalchemy import event, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session as SyncSession

from ..config import get_settings
from ..models import DevicePushToken, Notification
from ..security import utcnow

log = logging.getLogger("annadaan.push")

FOOD = {"veg": ("veg meal", "शाकाहारी भोजन"), "nonveg": ("non-veg meal", "मांसाहारी भोजन")}

# kind -> (title_en, title_hi, body_en, body_hi); filled with str.format(**params)
TEMPLATES: dict[str, tuple[str, str, str, str]] = {
    "reservation_created": (
        "Your food was reserved",
        "आपका खाना आरक्षित हो गया",
        "{collector} reserved your {food_en} for {servings} people. They plan to come {eta_en}.",
        "{collector} ने {servings} लोगों का {food_hi} आरक्षित किया। वे {eta_hi} आएँगे।",
    ),
    "reservation_cancelled_by_collector": (
        "Reservation cancelled",
        "आरक्षण रद्द हुआ",
        "{collector} cancelled. Your {food_en} is back on the list for others nearby.",
        "{collector} ने आरक्षण रद्द किया। आपका {food_hi} फिर से सूची में है।",
    ),
    "reservation_cancelled_by_donor": (
        "Meal no longer reserved for you",
        "यह भोजन अब आपके लिए आरक्षित नहीं",
        "{donor} made the {food_en} available to others again. Your pick-up code no longer works.",
        "{donor} ने {food_hi} फिर से दूसरों के लिए उपलब्ध किया। आपका पिक-अप कोड अब काम नहीं करेगा।",
    ),
    "listing_cancelled": (
        "Food post cancelled",
        "खाने की पोस्ट रद्द हुई",
        "{donor} cancelled the {food_en} you reserved. Please don't go to collect it.",
        "{donor} ने आपका आरक्षित {food_hi} रद्द कर दिया। कृपया लेने न जाएँ।",
    ),
    "pickup_completed": (
        "Food handed over",
        "खाना पहुँच गया",
        "{servings} people will eat well. Leave a short review for {other}.",
        "{servings} लोग अच्छा खाएँगे। {other} के लिए छोटी समीक्षा लिखें।",
    ),
    "guard_confirm_request": (
        "Was the food collected?",
        "क्या खाना ले लिया गया?",
        "Let us know once the {food_en} left with the guard has been picked up.",
        "गार्ड के पास रखा {food_hi} ले लिया जाए, तो हमें बताएँ।",
    ),
    "expiry_reminder": (
        "Pick-up time is almost over",
        "पिक-अप का समय ख़त्म होने वाला है",
        "The {food_en} you reserved is good until {until}. Collect it soon or cancel so others can.",
        "आपका आरक्षित {food_hi} {until} तक ठीक है। जल्दी लें या रद्द करें ताकि कोई और ले सके।",
    ),
    "listing_expired": (
        "Your food post has ended",
        "आपकी खाने की पोस्ट समाप्त हुई",
        "The {food_en} passed its good-until time and was removed from the list.",
        "{food_hi} का समय पूरा हो गया, इसलिए इसे सूची से हटा दिया गया।",
    ),
    "reservation_expired": (
        "Reservation ended",
        "आरक्षण समाप्त हुआ",
        "The {food_en} reservation ended because its good-until time passed.",
        "समय पूरा होने के कारण {food_hi} का आरक्षण समाप्त हो गया।",
    ),
    "listing_removed": (
        "Food post removed",
        "खाने की पोस्ट हटाई गई",
        "The Anndaan team removed a food post linked to you after a review.",
        "जाँच के बाद अन्नदान टीम ने आपसे जुड़ी एक पोस्ट हटा दी।",
    ),
    "ngo_verified": (
        "Your NGO is active",
        "आपकी संस्था सक्रिय है",
        "{ngo} can post meal needs again.",
        "{ngo} फिर से भोजन की ज़रूरत बता सकती है।",
    ),
    "ngo_rejected": (
        "Your NGO has been paused",
        "आपकी संस्था रोकी गई है",
        "{ngo} cannot post meal needs right now: {reason}. Contact Anndaan support.",
        "{ngo} अभी भोजन की ज़रूरत नहीं बता सकती: {reason}। अन्नदान सहायता से संपर्क करें।",
    ),
    "pledge_created": (
        "A donor is bringing meals",
        "एक दाता भोजन ला रहे हैं",
        "{donor} will give {meal_en} for {people} on {date}.",
        "{donor} {date} को {people} लोगों का {meal_hi} देंगे।",
    ),
    "pledge_cancelled": (
        "A donor cancelled",
        "एक दाता ने रद्द किया",
        "{donor} can no longer give {meal_en} for {people} on {date}.",
        "{donor} अब {date} को {people} लोगों का {meal_hi} नहीं दे पाएँगे।",
    ),
}

MEAL_NAMES = {
    "breakfast": ("breakfast", "नाश्ता"),
    "lunch": ("lunch", "दोपहर का खाना"),
    "dinner": ("dinner", "रात का खाना"),
}


def eta_text(minutes: int | None) -> tuple[str, str]:
    if minutes is None:
        return "before the good-until time", "समय ख़त्म होने से पहले"
    if minutes < 60:
        return f"in {minutes} min", f"{minutes} मिनट में"
    hours = minutes // 60
    return (f"in {hours} hour" + ("s" if hours > 1 else ""), f"{hours} घंटे में")


def notify(session: AsyncSession, user_id: uuid.UUID, kind: str, data: dict | None = None, **params) -> None:
    title_en, title_hi, body_en, body_hi = TEMPLATES[kind]
    n = Notification(
        id=uuid.uuid4(),
        user_id=user_id,
        kind=kind,
        title_en=title_en.format(**params),
        title_hi=title_hi.format(**params),
        body_en=body_en.format(**params)[:300],
        body_hi=body_hi.format(**params)[:400],
        data={"kind": kind, **(data or {})},
    )
    session.add(n)
    session.info.setdefault("push_queue", []).append(n.id)


@event.listens_for(SyncSession, "after_commit")
def _after_commit(sync_session: SyncSession) -> None:
    ids = sync_session.info.pop("push_queue", None)
    if not ids:
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    task = loop.create_task(send_push(ids))
    _background.add(task)
    task.add_done_callback(_background.discard)


@event.listens_for(SyncSession, "after_rollback")
def _after_rollback(sync_session: SyncSession) -> None:
    sync_session.info.pop("push_queue", None)


_background: set[asyncio.Task] = set()


async def send_push(notification_ids: list[uuid.UUID]) -> None:
    from ..db import SessionLocal

    try:
        async with SessionLocal() as session:
            rows = (
                await session.execute(
                    select(Notification, DevicePushToken.token)
                    .join(DevicePushToken, DevicePushToken.user_id == Notification.user_id)
                    .where(Notification.id.in_(notification_ids))
                )
            ).all()
            if not rows:
                return
            messages = [
                {
                    "to": token,
                    "title": f"{n.title_en} · {n.title_hi}",
                    "body": n.body_en,
                    "data": {**n.data, "notification_id": str(n.id)},
                    "sound": "default",
                    "channelId": "default",
                }
                for n, token in rows
            ]
            s = get_settings()
            headers = {"Accept": "application/json", "Content-Type": "application/json"}
            if s.expo_access_token:
                headers["Authorization"] = f"Bearer {s.expo_access_token}"
            async with httpx.AsyncClient(timeout=10) as client:
                for i in range(0, len(messages), 100):
                    chunk = messages[i : i + 100]
                    resp = await client.post(s.expo_push_url, json=chunk, headers=headers)
                    tickets = resp.json().get("data", []) if resp.status_code == 200 else []
                    for msg, ticket in zip(chunk, tickets):
                        if ticket.get("status") == "error" and (ticket.get("details") or {}).get(
                            "error"
                        ) == "DeviceNotRegistered":
                            await session.execute(
                                DevicePushToken.__table__.delete().where(DevicePushToken.token == msg["to"])
                            )
            await session.execute(
                update(Notification).where(Notification.id.in_(notification_ids)).values(pushed_at=utcnow())
            )
            await session.commit()
    except Exception:  # push is best-effort; the in-app notification row remains
        log.exception("push delivery failed")
