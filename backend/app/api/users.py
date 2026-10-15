import uuid

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, select

from .. import schemas as S
from ..deps import CurrentUser, Session, client_ip
from ..errors import AppError, not_found
from ..models import FoodListing, Report, Review, User
from ..services import present
from ..services.audit import audit

router = APIRouter(tags=["profiles"])


@router.get("/users/{user_id}/profile", response_model=S.PublicProfile)
async def profile(user_id: uuid.UUID, session: Session):
    """Public profile: meals shared, rating and reviews. No phone number or address."""
    user = await session.get(User, user_id)
    if user is None or user.status != "active":
        raise not_found("profile")
    stats = await present.user_stats(session, user)
    tag_rows = (
        await session.execute(
            select(func.unnest(Review.tags).label("tag"), func.count())
            .where(Review.subject_id == user.id, Review.hidden.is_(False))
            .group_by("tag")
            .order_by(func.count().desc())
            .limit(5)
        )
    ).all()
    reviews = (
        await session.scalars(
            select(Review)
            .where(Review.subject_id == user.id, Review.hidden.is_(False))
            .order_by(Review.created_at.desc())
            .limit(20)
        )
    ).unique().all()
    return S.PublicProfile(
        id=user.id,
        display_name=present.display_name(user),
        area=user.area,
        rating=stats.rating,
        review_count=stats.review_count,
        meals_shared=stats.meals_shared,
        people_fed=stats.people_fed,
        since_year=stats.since_year,
        top_tags=[S.TagCount(tag=t, count=c) for t, c in tag_rows],
        reviews=[present.review_out(r) for r in reviews],
    )


@router.get("/users/{user_id}/reviews", response_model=S.Page[S.ReviewOut])
async def reviews(user_id: uuid.UUID, session: Session, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    q = select(Review).where(Review.subject_id == user_id, Review.hidden.is_(False))
    total = await session.scalar(select(func.count()).select_from(q.subquery()))
    rows = (await session.scalars(q.order_by(Review.created_at.desc()).limit(limit).offset(offset))).unique().all()
    return S.Page(items=[present.review_out(r) for r in rows], total=total, limit=limit, offset=offset)


@router.post("/reports", response_model=S.ReportOut, status_code=201)
async def report(body: S.ReportIn, user: CurrentUser, session: Session, request: Request):
    """Report unsafe food or abusive behaviour. Reviewed by the Anndaan team."""
    if body.listing_id is None and body.user_id is None:
        raise AppError(422, "report_target", "Say which food post or person you are reporting.")
    if body.listing_id and await session.get(FoodListing, body.listing_id) is None:
        raise not_found("food post")
    if body.user_id and await session.get(User, body.user_id) is None:
        raise not_found("profile")
    if body.user_id == user.id:
        raise AppError(422, "report_self", "You cannot report yourself.")
    open_by_me = await session.scalar(
        select(func.count()).where(Report.reporter_id == user.id, Report.status == "open")
    )
    if open_by_me >= 10:
        raise AppError(429, "too_many_reports", "You have many open reports. We will review them soon.")
    r = Report(reporter_id=user.id, listing_id=body.listing_id, user_id=body.user_id, reason=body.reason, details=body.details)
    session.add(r)
    await session.flush()
    audit(session, "report.create", "report", r.id, user.id, client_ip(request), reason=body.reason)
    await session.commit()
    await session.refresh(r)
    return r
