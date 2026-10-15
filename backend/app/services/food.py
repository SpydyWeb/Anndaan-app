"""Food listings and reservations: every state change happens here.

Concurrency model: any operation that changes a listing or its reservation first takes a
row lock on the listing (SELECT ... FOR UPDATE). Operations on the same meal therefore run
one at a time, and each re-checks state after acquiring the lock. A partial unique index
(one 'active' reservation per listing) backs this up at the database level.

Listing states:  available -> reserved -> collected
                 available|reserved -> cancelled (donor) | expired (time) | removed (admin)
                 reserved -> available (collector cancels, or donor reactivates a no-show)
Reservation:     active -> completed | cancelled_by_collector | cancelled_by_donor | expired
"""

import uuid
from datetime import datetime, timedelta, timezone

from geoalchemy2 import Geography
from geoalchemy2.functions import ST_MakePoint, ST_SetSRID
from sqlalchemy import cast, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .. import schemas as S
from ..config import get_settings
from ..errors import AppError, conflict, forbidden, not_found
from ..models import FoodListing, PickupVerification, Reservation, User
from ..security import constant_eq, numeric_code, utcnow
from .audit import audit
from .notify import FOOD, eta_text, notify
from .present import first_name

MIN_LEAD = timedelta(minutes=15)
MAX_GOOD_FOR = timedelta(hours=24)  # cooked food: never list beyond 24h, whatever the donor says
HANDOVER_GRACE = timedelta(minutes=30)  # a reserved meal may be handed over this long after good-until
IST = timezone(timedelta(hours=5, minutes=30))  # India has no DST
MAX_ACTIVE_RESERVATIONS = 2  # per collector, to stop one person holding many meals


def point(lat: float, lng: float):
    return cast(ST_SetSRID(ST_MakePoint(lng, lat), 4326), Geography(srid=4326))


def _check_good_until(good_until: datetime, cooked_at: datetime | None = None) -> None:
    if good_until.tzinfo is None:
        raise AppError(422, "timezone_required", "Times must include a timezone.")
    now = utcnow()
    if good_until < now + MIN_LEAD:
        raise AppError(422, "good_until_too_soon", "Good-until must be at least 15 minutes from now.")
    if good_until > now + MAX_GOOD_FOR:
        raise AppError(422, "good_until_too_late", "Cooked food can be listed for at most 24 hours.")
    if cooked_at is not None:
        if cooked_at.tzinfo is None:
            raise AppError(422, "timezone_required", "Times must include a timezone.")
        if cooked_at > now + timedelta(minutes=5):
            raise AppError(422, "cooked_in_future", "Cooking time cannot be in the future.")
        if cooked_at < now - timedelta(hours=12):
            raise AppError(422, "cooked_too_long_ago", "Food cooked more than 12 hours ago cannot be shared.")


def _food(listing: FoodListing) -> dict:
    en, hi = FOOD[listing.food_type]
    return {"food_en": en, "food_hi": hi}


async def lock_listing(session: AsyncSession, listing_id: uuid.UUID) -> FoodListing:
    listing = await session.scalar(
        select(FoodListing).where(FoodListing.id == listing_id).with_for_update(of=FoodListing)
    )
    if listing is None:
        raise not_found("food post")
    return listing


async def _active_res(session: AsyncSession, listing_id: uuid.UUID) -> Reservation | None:
    return await session.scalar(
        select(Reservation)
        .where(Reservation.listing_id == listing_id, Reservation.status == "active")
        .with_for_update(of=Reservation)
    )


def _set_status(listing: FoodListing, status: str) -> None:
    listing.status = status
    listing.status_changed_at = utcnow()


# ---------- listings ----------


async def create_listing(session: AsyncSession, donor: User, data: S.ListingCreateIn, ip: str | None) -> FoodListing:
    if not donor.name:
        raise AppError(422, "name_required", "Add your name before posting food.")
    _check_good_until(data.good_until, data.cooked_at)
    listing = FoodListing(
        id=uuid.uuid4(),
        donor_id=donor.id,
        food_type=data.food_type,
        servings=data.servings,
        good_until=data.good_until,
        cooked_at=data.cooked_at,
        note=data.note,
        pickup_method=data.pickup_method,
        address=data.address,
        area=data.area,
        location=point(data.lat, data.lng),
    )
    session.add(listing)
    audit(session, "listing.create", "listing", listing.id, donor.id, ip, servings=data.servings)
    await session.commit()
    return await session.get(FoodListing, listing.id, populate_existing=True)


async def update_listing(
    session: AsyncSession, donor: User, listing_id: uuid.UUID, data: S.ListingUpdateIn, ip: str | None
) -> FoodListing:
    listing = await lock_listing(session, listing_id)
    if listing.donor_id != donor.id:
        raise forbidden("Only the person who posted this food can edit it.")
    if listing.status != "available" or listing.good_until <= utcnow():
        raise conflict("listing_not_editable", "Only food that is still available can be edited.")
    fields = data.model_dump(exclude_unset=True)
    if "good_until" in fields:
        _check_good_until(fields["good_until"], listing.cooked_at)
    if ("lat" in fields) != ("lng" in fields):
        raise AppError(422, "location_incomplete", "Send both latitude and longitude.")
    if "lat" in fields:
        listing.location = point(fields.pop("lat"), fields.pop("lng"))
    for k, v in fields.items():
        if v is None and k not in ("note",):
            continue
        setattr(listing, k, v)
    audit(session, "listing.update", "listing", listing.id, donor.id, ip, fields=sorted(fields))
    await session.commit()
    return await session.get(FoodListing, listing.id, populate_existing=True)


async def cancel_listing(session: AsyncSession, donor: User, listing_id: uuid.UUID, ip: str | None) -> FoodListing:
    listing = await lock_listing(session, listing_id)
    if listing.donor_id != donor.id:
        raise forbidden("Only the person who posted this food can cancel it.")
    if listing.status not in ("available", "reserved"):
        raise conflict("listing_closed", "This food post is already closed.")
    res = await _active_res(session, listing.id)
    if res is not None:
        res.status = "cancelled_by_donor"
        res.cancelled_at = utcnow()
        res.cancel_reason = "listing cancelled"
        notify(session, res.collector_id, "listing_cancelled", {"reservation_id": str(res.id)},
               donor=first_name(donor), **_food(listing))
    _set_status(listing, "cancelled")
    audit(session, "listing.cancel", "listing", listing.id, donor.id, ip)
    await session.commit()
    return listing


async def reactivate_listing(
    session: AsyncSession, donor: User, listing_id: uuid.UUID, data: S.ReactivateIn, ip: str | None
) -> FoodListing:
    """'They didn't come': cancel the reservation (its code stops working) and relist."""
    listing = await lock_listing(session, listing_id)
    if listing.donor_id != donor.id:
        raise forbidden("Only the person who posted this food can do this.")
    if listing.status != "reserved":
        raise conflict("listing_not_reserved", "This food is not reserved right now.")
    good_until = data.good_until or listing.good_until
    if good_until <= utcnow():
        raise conflict("listing_expired", "This food has passed its good-until time. Post it again if it is still fresh.")
    if data.good_until is not None:
        if data.good_until > listing.good_until:
            raise AppError(422, "good_until_extended", "You can shorten the good-until time, not extend it.")
        _check_good_until(data.good_until)
    res = await _active_res(session, listing.id)
    if res is not None:
        res.status = "cancelled_by_donor"
        res.cancelled_at = utcnow()
        res.cancel_reason = "no-show; relisted by donor"
        notify(session, res.collector_id, "reservation_cancelled_by_donor", {"listing_id": str(listing.id)},
               donor=first_name(donor), **_food(listing))
    listing.good_until = good_until
    listing.expiry_reminder_sent_at = None
    _set_status(listing, "available")
    audit(session, "listing.reactivate", "listing", listing.id, donor.id, ip,
          reservation_id=res.id if res else None)
    await session.commit()
    return listing


# ---------- reservations ----------


async def reserve(
    session: AsyncSession, collector: User, listing_id: uuid.UUID, data: S.ReservationCreateIn, ip: str | None
) -> tuple[Reservation, bool]:
    """Reserve the whole portion. Returns (reservation, created). Retrying with the same
    idempotency key returns the original reservation instead of failing."""

    async def existing() -> Reservation | None:
        if not data.idempotency_key:
            return None
        return await session.scalar(
            select(Reservation).where(
                Reservation.collector_id == collector.id, Reservation.idempotency_key == data.idempotency_key
            )
        )

    if (found := await existing()) is not None:
        return found, False
    if not collector.name:
        raise AppError(422, "name_required", "Add your name before reserving.")

    listing = await lock_listing(session, listing_id)
    if (found := await existing()) is not None:  # same key raced us and won
        return found, False
    now = utcnow()
    if listing.donor_id == collector.id:
        raise conflict("own_listing", "You cannot reserve food you posted.")
    if listing.status == "reserved":
        raise conflict("listing_reserved", "Someone else just reserved this meal.")
    if listing.status != "available":
        raise conflict("listing_unavailable", "This meal is no longer available.")
    if listing.good_until <= now:
        raise conflict("listing_expired", "This meal has passed its good-until time.")
    active_count = len(
        (
            await session.scalars(
                select(Reservation.id).where(
                    Reservation.collector_id == collector.id, Reservation.status == "active"
                )
            )
        ).all()
    )
    if active_count >= MAX_ACTIVE_RESERVATIONS:
        raise conflict("too_many_reservations", "Collect or cancel your current reservations first.")

    expected = listing.good_until if data.eta_minutes is None else now + timedelta(minutes=data.eta_minutes)
    if expected > listing.good_until:
        raise AppError(422, "eta_after_good_until", "Choose a time before the food's good-until time.")
    res = Reservation(
        id=uuid.uuid4(),
        listing_id=listing.id,
        collector_id=collector.id,
        for_whom=data.for_whom,
        eta_minutes=data.eta_minutes,
        expected_at=expected,
        idempotency_key=data.idempotency_key,
    )
    session.add(res)
    await session.flush()
    if listing.pickup_method == "door":
        session.add(
            PickupVerification(
                reservation_id=res.id,
                code=numeric_code(4),
                expires_at=listing.good_until + HANDOVER_GRACE,
            )
        )
    _set_status(listing, "reserved")
    eta_en, eta_hi = eta_text(data.eta_minutes)
    notify(session, listing.donor_id, "reservation_created",
           {"reservation_id": str(res.id), "listing_id": str(listing.id)},
           collector=first_name(collector), servings=listing.servings, eta_en=eta_en, eta_hi=eta_hi, **_food(listing))
    audit(session, "reservation.create", "reservation", res.id, collector.id, ip, listing_id=listing.id)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        if (found := await existing()) is not None:
            return found, False
        raise conflict("listing_reserved", "Someone else just reserved this meal.")
    return await load_reservation(session, res.id), True


async def load_reservation(session: AsyncSession, res_id: uuid.UUID) -> Reservation:
    res = await session.get(Reservation, res_id, populate_existing=True)
    if res is None:
        raise not_found("reservation")
    return res


async def _locked_res(session: AsyncSession, res_id: uuid.UUID) -> tuple[Reservation, FoodListing]:
    res = await session.get(Reservation, res_id)
    if res is None:
        raise not_found("reservation")
    listing = await lock_listing(session, res.listing_id)
    res = await session.scalar(
        select(Reservation).where(Reservation.id == res_id).with_for_update(of=Reservation)
        .execution_options(populate_existing=True)
    )
    return res, listing


def _participant(res: Reservation, listing: FoodListing, user: User) -> str:
    if user.id == listing.donor_id:
        return "donor"
    if user.id == res.collector_id:
        return "collector"
    raise not_found("reservation")  # don't reveal other people's reservations


async def cancel_reservation(session: AsyncSession, user: User, res_id: uuid.UUID, ip: str | None) -> Reservation:
    res, listing = await _locked_res(session, res_id)
    if _participant(res, listing, user) != "collector":
        raise forbidden("Only the person who reserved can cancel. Donors use 'Make available again'.")
    if res.status != "active":
        raise conflict("reservation_closed", "This reservation is already closed.")
    res.status = "cancelled_by_collector"
    res.cancelled_at = utcnow()
    if listing.status == "reserved":
        _set_status(listing, "available" if listing.good_until > utcnow() else "expired")
        listing.expiry_reminder_sent_at = None
    notify(session, listing.donor_id, "reservation_cancelled_by_collector", {"listing_id": str(listing.id)},
           collector=first_name(user), **_food(listing))
    audit(session, "reservation.cancel", "reservation", res.id, user.id, ip)
    await session.commit()
    return await load_reservation(session, res.id)


def _complete(session: AsyncSession, res: Reservation, listing: FoodListing, donor: User, collector: User) -> None:
    now = utcnow()
    res.status = "completed"
    res.completed_at = now
    _set_status(listing, "collected")
    for uid, other in ((donor.id, first_name(collector)), (collector.id, first_name(donor))):
        notify(session, uid, "pickup_completed", {"reservation_id": str(res.id)},
               servings=listing.servings, other=other)


async def verify_code(
    session: AsyncSession, user: User, res_id: uuid.UUID, code: str, ip: str | None
) -> Reservation:
    """Door hand-over: the donor types the code the collector tells them."""
    res, listing = await _locked_res(session, res_id)
    if _participant(res, listing, user) != "donor":
        raise forbidden("Only the donor enters the pick-up code.")
    if listing.pickup_method != "door" or res.pickup is None:
        raise conflict("no_code", "This hand-over is confirmed with 'Yes, collected', not a code.")
    if res.status == "completed":
        raise conflict("already_completed", "This food was already handed over.")
    if res.status != "active":
        raise conflict("reservation_closed", "This reservation is no longer active.")
    pv = res.pickup
    now = utcnow()
    if pv.locked_at is not None:
        raise conflict("code_locked", "Too many wrong codes. Make the meal available again, or ask Anndaan support.")
    if pv.expires_at <= now:
        raise conflict("code_expired", "This pick-up code has expired.")
    if not constant_eq(pv.code, code):
        pv.attempts += 1
        left = get_settings().pickup_code_max_attempts - pv.attempts
        if left <= 0:
            pv.locked_at = now
        audit(session, "pickup.code_wrong", "reservation", res.id, user.id, ip, attempts=pv.attempts)
        await session.commit()
        raise AppError(422, "code_wrong", "That code is not right. Check it with the person collecting.",
                       {"attempts_left": max(0, left)})
    pv.verified_at = now
    res.donor_confirmed_at = now
    _complete(session, res, listing, listing.donor, res.collector)
    audit(session, "pickup.verified", "reservation", res.id, user.id, ip)
    await session.commit()
    return await load_reservation(session, res.id)


async def confirm_collected(session: AsyncSession, user: User, res_id: uuid.UUID, ip: str | None) -> Reservation:
    """Guard hand-over: the first 'Yes, collected' from either side closes the meal.
    Repeating it is harmless and returns the completed reservation."""
    res, listing = await _locked_res(session, res_id)
    role = _participant(res, listing, user)
    if listing.pickup_method != "guard":
        raise conflict("code_required", "Door pick-ups are confirmed with the pick-up code.")
    if res.status == "completed":
        return res
    if res.status != "active":
        raise conflict("reservation_closed", "This reservation is no longer active.")
    if utcnow() > listing.good_until + HANDOVER_GRACE:
        raise conflict("reservation_expired", "The hand-over window for this meal has ended.")
    now = utcnow()
    if role == "donor":
        res.donor_confirmed_at = now
    else:
        res.collector_confirmed_at = now
    _complete(session, res, listing, listing.donor, res.collector)
    audit(session, "pickup.confirmed", "reservation", res.id, user.id, ip, by=role)
    await session.commit()
    return await load_reservation(session, res.id)


# ---------- scheduled expiry ----------


async def run_expiry(session: AsyncSession) -> dict[str, int]:
    """Close food past its time and remind collectors. Safe to run concurrently: rows are
    locked with SKIP LOCKED, so two workers never process the same meal."""
    now = utcnow()
    counts = {"expired_available": 0, "expired_reserved": 0, "reminders": 0}

    stale = (
        await session.scalars(
            select(FoodListing)
            .where(FoodListing.status == "available", FoodListing.good_until <= now)
            .with_for_update(skip_locked=True, of=FoodListing)
            .limit(500)
        )
    ).all()
    for listing in stale:
        _set_status(listing, "expired")
        notify(session, listing.donor_id, "listing_expired", {"listing_id": str(listing.id)}, **_food(listing))
        counts["expired_available"] += 1

    overdue = (
        await session.scalars(
            select(FoodListing)
            .where(FoodListing.status == "reserved", FoodListing.good_until + HANDOVER_GRACE <= now)
            .with_for_update(skip_locked=True, of=FoodListing)
            .limit(500)
        )
    ).all()
    for listing in overdue:
        res = await _active_res(session, listing.id)
        if res is not None:
            res.status = "expired"
            res.cancelled_at = now
            notify(session, res.collector_id, "reservation_expired", {"reservation_id": str(res.id)}, **_food(listing))
        _set_status(listing, "expired")
        notify(session, listing.donor_id, "listing_expired", {"listing_id": str(listing.id)}, **_food(listing))
        counts["expired_reserved"] += 1

    due = (
        await session.scalars(
            select(FoodListing)
            .where(
                FoodListing.status == "reserved",
                FoodListing.expiry_reminder_sent_at.is_(None),
                FoodListing.good_until - timedelta(minutes=30) <= now,
                FoodListing.good_until > now,
            )
            .with_for_update(skip_locked=True, of=FoodListing)
            .limit(500)
        )
    ).all()
    for listing in due:
        res = await _active_res(session, listing.id)
        listing.expiry_reminder_sent_at = now
        if res is None:
            continue
        until = listing.good_until.astimezone(IST).strftime("%I:%M %p").lstrip("0").lower()
        notify(session, res.collector_id, "expiry_reminder", {"reservation_id": str(res.id)},
               until=until, **_food(listing))
        if listing.pickup_method == "guard":
            notify(session, listing.donor_id, "guard_confirm_request", {"reservation_id": str(res.id)},
                   **_food(listing))
        counts["reminders"] += 1

    await session.commit()
    return counts

