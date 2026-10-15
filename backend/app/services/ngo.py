"""NGO needs and donor pledges.

A need repeats (once/daily/weekly/monthly). Coverage is counted per occurrence date: a
daily lunch for 30 needs 30 people covered every day. Pledges go straight in with no
accept/reject step; a row lock on the need keeps the total from going over."""

import calendar
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import schemas as S
from ..errors import AppError, conflict, forbidden, not_found
from ..models import Ngo, NgoNeed, NgoPledge, User
from ..security import utcnow
from .audit import audit
from .food import IST
from .notify import MEAL_NAMES, notify
from .present import first_name


def today_ist() -> date:
    return utcnow().astimezone(IST).date()


def _add_months(d: date, months: int, day: int) -> date:
    m = d.month - 1 + months
    y, m = d.year + m // 12, m % 12 + 1
    return date(y, m, min(day, calendar.monthrange(y, m)[1]))


def occurrences(need: NgoNeed, start: date, count: int) -> list[date]:
    """The next `count` dates on or after `start` when this need applies."""
    out: list[date] = []
    first = need.start_date
    end = need.end_date
    if need.frequency == "once":
        dates = [first] if first >= start else []
        return [d for d in dates if end is None or d <= end][:count]
    if need.frequency == "daily":
        d = max(first, start)
        step = timedelta(days=1)
    elif need.frequency == "weekly":
        d = first
        if d < start:
            d = d + timedelta(weeks=-(-(start - d).days // 7))
        step = timedelta(weeks=1)
    else:  # monthly
        i = 0
        while len(out) < count and i < 240:
            d = _add_months(first, i, first.day)
            if d >= start and (end is None or d <= end):
                out.append(d)
            if end is not None and d > end:
                break
            i += 1
        return out
    while len(out) < count:
        if end is not None and d > end:
            break
        out.append(d)
        d = d + step
    return out


def _first_bookable(need: NgoNeed) -> date:
    """Today's occurrence is bookable until its meal time has passed (IST)."""
    now = utcnow().astimezone(IST)
    if now.time() >= need.meal_time:
        return now.date() + timedelta(days=1)
    return now.date()


async def coverage(session: AsyncSession, need_ids: list[uuid.UUID], dates: list[date]) -> dict[tuple, int]:
    if not need_ids or not dates:
        return {}
    rows = (
        await session.execute(
            select(NgoPledge.need_id, NgoPledge.for_date, func.sum(NgoPledge.people))
            .where(
                NgoPledge.need_id.in_(need_ids),
                NgoPledge.for_date.in_(dates),
                NgoPledge.status != "cancelled",
            )
            .group_by(NgoPledge.need_id, NgoPledge.for_date)
        )
    ).all()
    return {(nid, d): int(total) for nid, d, total in rows}


def _occ(need: NgoNeed, d: date, cov: dict) -> S.Occurrence:
    covered = cov.get((need.id, d), 0)
    return S.Occurrence(date=d, covered=covered, remaining=max(0, need.people - covered))


def ngo_public(ngo: Ngo) -> S.NgoPublic:
    return S.NgoPublic(id=ngo.id, name=ngo.name, verified=ngo.status == "verified", area=ngo.area)


async def need_cards(
    session: AsyncSession, needs: list[NgoNeed], distances: dict[uuid.UUID, float | None] | None = None
) -> list[S.NeedCard]:
    nexts = {n.id: (occurrences(n, _first_bookable(n), 1) or [None])[0] for n in needs}
    cov = await coverage(session, [n.id for n in needs], [d for d in nexts.values() if d])
    out = []
    for n in needs:
        d = nexts[n.id]
        dist = (distances or {}).get(n.id)
        out.append(
            S.NeedCard(
                id=n.id,
                ngo=ngo_public(n.ngo),
                meal=n.meal,
                people=n.people,
                audience=n.audience,
                frequency=n.frequency,
                start_date=n.start_date,
                end_date=n.end_date,
                meal_time=n.meal_time,
                food_pref=n.food_pref,
                status=n.status,
                next=_occ(n, d, cov) if d else None,
                distance_km=None if dist is None else round(dist / 1000, 1),
            )
        )
    return out


async def need_detail(session: AsyncSession, need: NgoNeed) -> S.NeedDetail:
    upcoming_dates = occurrences(need, _first_bookable(need), 3)
    cov = await coverage(session, [need.id], upcoming_dates)
    card = (await need_cards(session, [need]))[0]
    return S.NeedDetail(
        **card.model_dump(), upcoming=[_occ(need, d, cov) for d in upcoming_dates], address=need.ngo.address
    )


async def create_need(session: AsyncSession, owner: User, data: S.NeedIn, ip: str | None) -> NgoNeed:
    ngo = await session.scalar(select(Ngo).where(Ngo.owner_id == owner.id))
    if ngo is None:
        raise not_found("NGO")
    if ngo.status != "verified":
        raise forbidden("Your NGO is paused by Anndaan support, so it cannot post meal needs.")
    if data.start_date < today_ist():
        raise AppError(422, "start_in_past", "The start date cannot be in the past.")
    if data.start_date > today_ist() + timedelta(days=90):
        raise AppError(422, "start_too_far", "Start within the next 90 days.")
    if data.end_date is not None and data.end_date < data.start_date:
        raise AppError(422, "end_before_start", "The end date must be after the start date.")
    need = NgoNeed(id=uuid.uuid4(), ngo_id=ngo.id, **data.model_dump())
    session.add(need)
    audit(session, "need.create", "need", need.id, owner.id, ip, people=data.people)
    await session.commit()
    return await session.get(NgoNeed, need.id, populate_existing=True)


async def pledge(
    session: AsyncSession, donor: User, need_id: uuid.UUID, data: S.PledgeIn, ip: str | None
) -> NgoPledge:
    need = await session.scalar(select(NgoNeed).where(NgoNeed.id == need_id).with_for_update(of=NgoNeed))
    if need is None:
        raise not_found("meal need")
    if need.status != "open" or need.ngo.status != "verified":
        raise conflict("need_closed", "This meal need is no longer open.")
    if need.ngo.owner_id == donor.id:
        raise conflict("own_need", "You cannot give to your own NGO's need.")
    if not donor.name:
        raise AppError(422, "name_required", "Add your name before giving meals.")
    valid = occurrences(need, _first_bookable(need), 14)
    if data.for_date not in valid:
        raise AppError(422, "invalid_date", "Pick one of the upcoming dates for this need.")
    covered = (await coverage(session, [need.id], [data.for_date])).get((need.id, data.for_date), 0)
    remaining = need.people - covered
    if remaining <= 0:
        raise conflict("need_full", "This day is already fully covered. Try another day.")
    if data.people > remaining:
        raise AppError(422, "too_many_people", f"Only {remaining} more people are needed that day.",
                       {"remaining": remaining})
    p = NgoPledge(id=uuid.uuid4(), need_id=need.id, donor_id=donor.id, **data.model_dump())
    session.add(p)
    meal_en, meal_hi = MEAL_NAMES[need.meal]
    notify(session, need.ngo.owner_id, "pledge_created", {"pledge_id": str(p.id), "need_id": str(need.id)},
           donor=first_name(donor), meal_en=meal_en, meal_hi=meal_hi, people=data.people,
           date=data.for_date.strftime("%d %b"))
    audit(session, "pledge.create", "pledge", p.id, donor.id, ip, need_id=need.id, people=data.people)
    await session.commit()
    return await session.get(NgoPledge, p.id, populate_existing=True)


async def pledge_out(session: AsyncSession, p: NgoPledge, include_donor: bool = False) -> S.PledgeOut:
    need = p.need
    cov = await coverage(session, [need.id], [p.for_date])
    card = (await need_cards(session, [need]))[0]
    return S.PledgeOut(
        id=p.id,
        status=p.status,
        people=p.people,
        for_date=p.for_date,
        delivery=p.delivery,
        created_at=p.created_at,
        received_at=p.received_at,
        need=card,
        occurrence=_occ(need, p.for_date, cov),
        ngo_contact_phone=need.ngo.contact_phone,
        ngo_address=need.ngo.address,
        donor_name=p.donor.name if include_donor else None,
        donor_phone=p.donor.phone if include_donor else None,
    )


async def cancel_pledge(session: AsyncSession, donor: User, pledge_id: uuid.UUID, ip: str | None) -> NgoPledge:
    p = await session.get(NgoPledge, pledge_id)
    if p is None or p.donor_id != donor.id:
        raise not_found("pledge")
    if p.status != "pledged":
        raise conflict("pledge_closed", "This pledge can no longer be cancelled.")
    if p.for_date < today_ist():
        raise conflict("pledge_past", "This date has already passed.")
    p.status = "cancelled"
    meal_en, meal_hi = MEAL_NAMES[p.need.meal]
    notify(session, p.need.ngo.owner_id, "pledge_cancelled", {"need_id": str(p.need_id)},
           donor=first_name(donor), meal_en=meal_en, meal_hi=meal_hi, people=p.people,
           date=p.for_date.strftime("%d %b"))
    audit(session, "pledge.cancel", "pledge", p.id, donor.id, ip)
    await session.commit()
    return p


async def close_finished_needs(session: AsyncSession) -> int:
    """One-time needs whose date passed, and needs past their end date, are closed."""
    today = today_ist()
    needs = (
        await session.scalars(
            select(NgoNeed).where(
                NgoNeed.status == "open",
                ((NgoNeed.frequency == "once") & (NgoNeed.start_date < today))
                | (NgoNeed.end_date.is_not(None) & (NgoNeed.end_date < today)),
            )
        )
    ).all()
    for n in needs:
        n.status = "closed"
    await session.commit()
    return len(needs)


def as_datetime(d: date, t) -> datetime:
    return datetime.combine(d, t, tzinfo=IST)
