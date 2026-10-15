"""Turn rows into API shapes. Privacy rules live here: exact addresses and phone numbers
are only included for the donor and the collector holding the reservation."""

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import schemas as S
from ..config import get_settings
from ..models import FoodImage, FoodListing, NgoPledge, Reservation, Review, User
from ..security import utcnow


def display_name(user: User | None) -> str:
    if user is None or not user.name:
        return "Anndaan member"
    parts = user.name.split()
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0]}."


def first_name(user: User | None) -> str:
    if user is None or not user.name:
        return "Anndaan member"
    return user.name.split()[0]


def image_out(img: FoodImage) -> S.ImageOut:
    return S.ImageOut(id=img.id, url=f"/api/v1/files/food/{img.id}", width=img.width, height=img.height)


async def ratings(session: AsyncSession, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, tuple[float | None, int]]:
    if not user_ids:
        return {}
    rows = (
        await session.execute(
            select(Review.subject_id, func.avg(Review.stars), func.count())
            .where(Review.subject_id.in_(user_ids), Review.hidden.is_(False))
            .group_by(Review.subject_id)
        )
    ).all()
    out: dict[uuid.UUID, tuple[float | None, int]] = {uid: (None, 0) for uid in user_ids}
    for uid, avg, count in rows:
        out[uid] = (round(float(avg), 1), count)
    return out


async def meals_shared(session: AsyncSession, user_id: uuid.UUID) -> int:
    return (
        await session.scalar(
            select(func.count()).where(FoodListing.donor_id == user_id, FoodListing.status == "collected")
        )
    ) or 0


def person(user: User, rating: tuple[float | None, int]) -> S.PersonBrief:
    return S.PersonBrief(id=user.id, display_name=display_name(user), rating=rating[0], review_count=rating[1])


def card(listing: FoodListing, rating: tuple[float | None, int], distance_m: float | None) -> S.ListingCard:
    return S.ListingCard(
        id=listing.id,
        food_type=listing.food_type,
        servings=listing.servings,
        good_until=listing.good_until,
        pickup_method=listing.pickup_method,
        area=listing.area,
        status=effective_status(listing),
        distance_km=None if distance_m is None else round(distance_m / 1000, 1),
        donor=person(listing.donor, rating),
        image=image_out(listing.images[0]) if listing.images else None,
        created_at=listing.created_at,
    )


def effective_status(listing: FoodListing) -> str:
    """Expiry is enforced on read, so a late background job can never show stale food."""
    if listing.status == "available" and listing.good_until <= utcnow():
        return "expired"
    return listing.status


def review_out(r: Review) -> S.ReviewOut:
    return S.ReviewOut(
        id=r.id,
        author_name=first_name(r.author),
        stars=r.stars,
        tags=list(r.tags or []),
        comment=r.comment,
        created_at=r.created_at,
    )


async def active_reservation(session: AsyncSession, listing_id: uuid.UUID) -> Reservation | None:
    return await session.scalar(
        select(Reservation).where(Reservation.listing_id == listing_id, Reservation.status == "active")
    )


async def listing_detail(
    session: AsyncSession, listing: FoodListing, viewer: User | None, distance_m: float | None
) -> S.ListingDetail:
    rating = (await ratings(session, {listing.donor_id}))[listing.donor_id]
    latest = await session.scalar(
        select(Review)
        .where(Review.subject_id == listing.donor_id, Review.hidden.is_(False))
        .order_by(Review.created_at.desc())
        .limit(1)
    )
    base = card(listing, rating, distance_m)
    detail = S.ListingDetail(
        **base.model_dump(),
        cooked_at=listing.cooked_at,
        note=listing.note,
        images=[image_out(i) for i in listing.images],
        latest_review=review_out(latest) if latest else None,
        donor_meals_shared=await meals_shared(session, listing.donor_id),
    )
    if viewer is None:
        return detail
    if viewer.id == listing.donor_id:
        detail.is_mine = True
        detail.address = listing.address
        detail.can_edit = listing.status == "available" and listing.good_until > utcnow()
        detail.current_reservation_id = await session.scalar(
            select(Reservation.id)
            .where(Reservation.listing_id == listing.id, Reservation.status.in_(("active", "completed")))
            .order_by(Reservation.created_at.desc())
            .limit(1)
        )
        return detail
    mine = await session.scalar(
        select(Reservation)
        .where(Reservation.listing_id == listing.id, Reservation.collector_id == viewer.id)
        .order_by(Reservation.created_at.desc())
        .limit(1)
    )
    if mine is not None:
        detail.my_reservation_id = mine.id
        if mine.status in ("active", "completed"):
            detail.address = listing.address
            detail.donor_phone = listing.donor.phone
            detail.donor_full_name = listing.donor.name
    return detail


async def reservation_out(session: AsyncSession, res: Reservation, viewer: User) -> S.ReservationOut:
    listing = res.listing
    is_donor = viewer.id == listing.donor_id
    rating = (await ratings(session, {listing.donor_id}))[listing.donor_id]
    live = res.status in ("active", "completed")
    pickup = res.pickup
    max_attempts = get_settings().pickup_code_max_attempts
    my_review = None
    if res.status == "completed":
        my_review = await session.scalar(
            select(Review.id).where(Review.reservation_id == res.id, Review.author_id == viewer.id)
        )
    return S.ReservationOut(
        id=res.id,
        status=res.status,
        for_whom=res.for_whom,
        eta_minutes=res.eta_minutes,
        expected_at=res.expected_at,
        created_at=res.created_at,
        completed_at=res.completed_at,
        cancelled_at=res.cancelled_at,
        donor_confirmed_at=res.donor_confirmed_at,
        collector_confirmed_at=res.collector_confirmed_at,
        role="donor" if is_donor else "collector",
        listing=card(listing, rating, None),
        address=listing.address if live else None,
        collector=S.CounterpartOut(id=res.collector.id, name=res.collector.name or "Anndaan member", phone=res.collector.phone)
        if is_donor and live
        else None,
        donor=S.CounterpartOut(id=listing.donor.id, name=listing.donor.name or "Anndaan member", phone=listing.donor.phone)
        if not is_donor and live
        else None,
        pickup_code=pickup.code
        if (pickup and not is_donor and res.status == "active" and pickup.locked_at is None)
        else None,
        code_attempts_left=max(0, max_attempts - pickup.attempts) if pickup else None,
        code_locked=bool(pickup and pickup.locked_at),
        can_review=res.status == "completed" and my_review is None,
        my_review_id=my_review,
    )


async def user_stats(session: AsyncSession, user: User) -> S.ImpactStats:
    shared, fed_food = (
        await session.execute(
            select(func.count(), func.coalesce(func.sum(FoodListing.servings), 0)).where(
                FoodListing.donor_id == user.id, FoodListing.status == "collected"
            )
        )
    ).one()
    fed_ngo = (
        await session.scalar(
            select(func.coalesce(func.sum(NgoPledge.people), 0)).where(
                NgoPledge.donor_id == user.id,
                NgoPledge.status != "cancelled",
                NgoPledge.for_date <= date.today(),
            )
        )
    ) or 0
    ngo_given = (
        await session.scalar(
            select(func.count()).where(NgoPledge.donor_id == user.id, NgoPledge.status != "cancelled")
        )
    ) or 0
    collected = (
        await session.scalar(
            select(func.count()).where(Reservation.collector_id == user.id, Reservation.status == "completed")
        )
    ) or 0
    rating = (await ratings(session, {user.id}))[user.id]
    return S.ImpactStats(
        meals_shared=shared,
        people_fed=int(fed_food) + int(fed_ngo),
        meals_collected=collected,
        ngo_meals_given=ngo_given,
        rating=rating[0],
        review_count=rating[1],
        since_year=user.created_at.year,
    )
