import uuid

from fastapi import APIRouter, Request
from sqlalchemy import select

from .. import schemas as S
from ..deps import CurrentUser, Session, client_ip
from ..errors import AppError, conflict, not_found
from ..models import Reservation, Review
from ..services import food, present
from ..services.audit import audit

router = APIRouter(prefix="/reservations", tags=["reservations"])


async def _visible(session, res_id: uuid.UUID, user) -> Reservation:
    res = await session.get(Reservation, res_id)
    if res is None or user.id not in (res.collector_id, res.listing.donor_id):
        raise not_found("reservation")
    return res


@router.get("/{res_id}", response_model=S.ReservationOut)
async def get_reservation(res_id: uuid.UUID, user: CurrentUser, session: Session):
    """For the donor and the collector only. The pick-up code is shown to the collector."""
    return await present.reservation_out(session, await _visible(session, res_id, user), user)


@router.post("/{res_id}/cancel", response_model=S.ReservationOut)
async def cancel(res_id: uuid.UUID, user: CurrentUser, session: Session, request: Request):
    res = await food.cancel_reservation(session, user, res_id, client_ip(request))
    return await present.reservation_out(session, res, user)


@router.post("/{res_id}/verify-code", response_model=S.ReservationOut)
async def verify_code(res_id: uuid.UUID, body: S.VerifyCodeIn, user: CurrentUser, session: Session, request: Request):
    """Door hand-over. The donor enters the 4-digit code; 5 wrong tries lock it."""
    res = await food.verify_code(session, user, res_id, body.code, client_ip(request))
    return await present.reservation_out(session, res, user)


@router.post("/{res_id}/confirm-collected", response_model=S.ReservationOut)
async def confirm_collected(res_id: uuid.UUID, user: CurrentUser, session: Session, request: Request):
    """Guard hand-over. The first 'Yes, collected' from either side closes the meal."""
    res = await food.confirm_collected(session, user, res_id, client_ip(request))
    return await present.reservation_out(session, res, user)


@router.post("/{res_id}/review", response_model=S.ReviewOut, status_code=201)
async def review(res_id: uuid.UUID, body: S.ReviewIn, user: CurrentUser, session: Session, request: Request):
    """Review the other person after a completed hand-over. Once per side."""
    res = await _visible(session, res_id, user)
    if res.status != "completed":
        raise conflict("not_completed", "You can review once the food has been handed over.")
    subject = res.listing.donor_id if user.id == res.collector_id else res.collector_id
    if await session.scalar(select(Review.id).where(Review.reservation_id == res.id, Review.author_id == user.id)):
        raise conflict("already_reviewed", "You already reviewed this hand-over.")
    if body.stars < 1:
        raise AppError(422, "validation_error", "Choose 1 to 5 stars.")
    r = Review(
        reservation_id=res.id,
        author_id=user.id,
        subject_id=subject,
        stars=body.stars,
        tags=list(dict.fromkeys(body.tags)),
        comment=body.comment,
    )
    session.add(r)
    audit(session, "review.create", "review", None, user.id, client_ip(request), reservation_id=res.id)
    await session.commit()
    r = await session.get(Review, r.id, populate_existing=True)
    return present.review_out(r)
