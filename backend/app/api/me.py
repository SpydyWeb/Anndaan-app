from typing import Literal

from fastapi import APIRouter, Query, Response
from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert

from .. import schemas as S
from ..deps import CurrentUser, Session
from ..models import DevicePushToken, FoodListing, NgoPledge, Notification, Reservation
from ..security import utcnow
from ..services import ngo as ngo_svc
from ..services import present
from ..services.auth import me_out

router = APIRouter(tags=["me"])


@router.get("/me", response_model=S.MeOut)
async def get_me(user: CurrentUser, session: Session):
    return await me_out(session, user)


@router.patch("/me", response_model=S.MeOut)
async def update_me(body: S.MeUpdateIn, user: CurrentUser, session: Session):
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(user, k, v)
    await session.commit()
    await session.refresh(user)
    return await me_out(session, user)


@router.get("/me/stats", response_model=S.ImpactStats)
async def my_stats(user: CurrentUser, session: Session):
    return await present.user_stats(session, user)


@router.get("/me/listings", response_model=S.Page[S.MyListing])
async def my_listings(
    user: CurrentUser,
    session: Session,
    state: Literal["open", "closed", "all"] = "all",
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Food I posted. `open` = available or reserved."""
    q = select(FoodListing).where(FoodListing.donor_id == user.id)
    if state == "open":
        q = q.where(FoodListing.status.in_(("available", "reserved")))
    elif state == "closed":
        q = q.where(FoodListing.status.not_in(("available", "reserved")))
    total = await session.scalar(select(func.count()).select_from(q.subquery()))
    rows = (await session.scalars(q.order_by(FoodListing.created_at.desc()).limit(limit).offset(offset))).unique().all()
    items = []
    for listing in rows:
        res = await present.active_reservation(session, listing.id)
        items.append(
            S.MyListing(
                listing=await present.listing_detail(session, listing, user, None),
                active_reservation=await present.reservation_out(session, res, user) if res else None,
            )
        )
    return S.Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/me/reservations", response_model=S.Page[S.ReservationOut])
async def my_reservations(
    user: CurrentUser,
    session: Session,
    state: Literal["active", "history", "all"] = "all",
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Meals I reserved or collected."""
    q = select(Reservation).where(Reservation.collector_id == user.id)
    if state == "active":
        q = q.where(Reservation.status == "active")
    elif state == "history":
        q = q.where(Reservation.status != "active")
    total = await session.scalar(select(func.count()).select_from(q.subquery()))
    rows = (await session.scalars(q.order_by(Reservation.created_at.desc()).limit(limit).offset(offset))).unique().all()
    return S.Page(
        items=[await present.reservation_out(session, r, user) for r in rows], total=total, limit=limit, offset=offset
    )


@router.get("/me/pledges", response_model=S.Page[S.PledgeOut])
async def my_pledges(
    user: CurrentUser, session: Session, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)
):
    """Meals I gave to NGOs."""
    q = select(NgoPledge).where(NgoPledge.donor_id == user.id)
    total = await session.scalar(select(func.count()).select_from(q.subquery()))
    rows = (await session.scalars(q.order_by(NgoPledge.for_date.desc()).limit(limit).offset(offset))).unique().all()
    return S.Page(
        items=[await ngo_svc.pledge_out(session, p) for p in rows], total=total, limit=limit, offset=offset
    )


@router.post("/me/push-tokens", status_code=204)
async def add_push_token(body: S.PushTokenIn, user: CurrentUser, session: Session):
    stmt = insert(DevicePushToken).values(user_id=user.id, token=body.token, platform=body.platform)
    stmt = stmt.on_conflict_do_update(
        index_elements=[DevicePushToken.token],
        set_={"user_id": user.id, "platform": body.platform, "last_seen_at": utcnow()},
    )
    await session.execute(stmt)
    await session.commit()
    return Response(status_code=204)


@router.delete("/me/push-tokens", status_code=204)
async def remove_push_token(body: S.PushTokenIn, user: CurrentUser, session: Session):
    await session.execute(
        delete(DevicePushToken).where(DevicePushToken.user_id == user.id, DevicePushToken.token == body.token)
    )
    await session.commit()
    return Response(status_code=204)


@router.get("/notifications", response_model=S.Page[S.NotificationOut])
async def notifications(
    user: CurrentUser, session: Session, limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0)
):
    q = select(Notification).where(Notification.user_id == user.id)
    total = await session.scalar(select(func.count()).select_from(q.subquery()))
    rows = (await session.scalars(q.order_by(Notification.created_at.desc()).limit(limit).offset(offset))).all()
    return S.Page(items=rows, total=total, limit=limit, offset=offset)


@router.get("/notifications/unread-count")
async def unread_count(user: CurrentUser, session: Session) -> dict[str, int]:
    n = await session.scalar(
        select(func.count()).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    )
    return {"unread": n or 0}


@router.post("/notifications/read", status_code=204)
async def mark_read(body: S.MarkReadIn, user: CurrentUser, session: Session):
    q = update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    if body.ids:
        q = q.where(Notification.id.in_(body.ids))
    await session.execute(q.values(read_at=utcnow()))
    await session.commit()
    return Response(status_code=204)
