import uuid
from datetime import timedelta

from fastapi import APIRouter, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import aliased

from .. import schemas as S
from ..deps import AdminUser, Session, client_ip
from ..errors import AppError, conflict, not_found
from ..models import (
    AuditLog,
    AuthSession,
    FoodListing,
    Ngo,
    NgoNeed,
    NgoPledge,
    Report,
    Reservation,
    User,
)
from ..security import utcnow
from ..services import sms, uploads
from ..services.audit import audit
from ..services.food import lock_listing
from ..services.notify import notify
from .ngos import ngo_out

router = APIRouter(prefix="/admin", tags=["admin"])


def _page(items, total, limit, offset):
    return S.Page(items=items, total=total or 0, limit=limit, offset=offset)


@router.get("/stats", response_model=S.AdminStats)
async def stats(_: AdminUser, session: Session):
    week = utcnow() - timedelta(days=7)

    async def count(q):
        return (await session.scalar(q)) or 0

    return S.AdminStats(
        users_total=await count(select(func.count(User.id))),
        users_new_7d=await count(select(func.count(User.id)).where(User.created_at > week)),
        users_suspended=await count(select(func.count(User.id)).where(User.status == "suspended")),
        listings_available=await count(
            select(func.count(FoodListing.id)).where(FoodListing.status == "available", FoodListing.good_until > utcnow())
        ),
        listings_reserved=await count(select(func.count(FoodListing.id)).where(FoodListing.status == "reserved")),
        listings_total=await count(select(func.count(FoodListing.id))),
        collections_total=await count(select(func.count(Reservation.id)).where(Reservation.status == "completed")),
        collections_7d=await count(
            select(func.count(Reservation.id)).where(Reservation.status == "completed", Reservation.completed_at > week)
        ),
        people_fed_total=await count(
            select(func.coalesce(func.sum(FoodListing.servings), 0)).where(FoodListing.status == "collected")
        ),
        reservations_active=await count(select(func.count(Reservation.id)).where(Reservation.status == "active")),
        ngos_pending=await count(select(func.count(Ngo.id)).where(Ngo.status == "pending")),
        ngos_verified=await count(select(func.count(Ngo.id)).where(Ngo.status == "verified")),
        reports_open=await count(select(func.count(Report.id)).where(Report.status == "open")),
        pledges_total=await count(select(func.count(NgoPledge.id)).where(NgoPledge.status != "cancelled")),
    )


# ---------- users ----------


@router.get("/users", response_model=S.Page[S.AdminUser])
async def users(
    _: AdminUser,
    session: Session,
    q: str | None = Query(None, max_length=60),
    status: str | None = Query(None, pattern="^(active|suspended)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    cond = []
    if q:
        like = f"%{q.strip()}%"
        cond.append(or_(User.name.ilike(like), User.phone.ilike(like)))
    if status:
        cond.append(User.status == status)
    listings = select(func.count(FoodListing.id)).where(FoodListing.donor_id == User.id).scalar_subquery()
    res = select(func.count(Reservation.id)).where(Reservation.collector_id == User.id).scalar_subquery()
    reps = select(func.count(Report.id)).where(Report.user_id == User.id).scalar_subquery()
    total = await session.scalar(select(func.count(User.id)).where(*cond))
    rows = (
        await session.execute(
            select(User, listings, res, reps).where(*cond).order_by(User.created_at.desc()).limit(limit).offset(offset)
        )
    ).all()
    items = []
    for u, lc, rc, pc in rows:
        a = S.AdminUser.model_validate(u)
        a.listings_count, a.reservations_count, a.reports_against = lc, rc, pc
        items.append(a)
    return _page(items, total, limit, offset)


async def _suspend(session, user_id: uuid.UUID, reason: str, admin: User, ip: str | None) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise not_found("user")
    if user.role == "admin":
        raise conflict("cannot_suspend_admin", "Admins cannot be suspended here.")
    user.status = "suspended"
    user.suspended_reason = reason
    await session.execute(
        update(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None)).values(revoked_at=utcnow())
    )
    open_ids = (
        await session.scalars(
            select(FoodListing.id).where(FoodListing.donor_id == user.id, FoodListing.status.in_(("available", "reserved")))
        )
    ).all()
    for lid in open_ids:
        await _remove_listing(session, lid, admin, "donor suspended")
    audit(session, "admin.user_suspend", "user", user.id, admin.id, ip, reason=reason)
    return user


@router.post("/users/{user_id}/suspend", response_model=S.AdminUser)
async def suspend(user_id: uuid.UUID, body: S.ReasonIn, admin: AdminUser, session: Session, request: Request):
    """Suspend: blocks sign-in and every API call, ends sessions, and takes their open food off the list."""
    user = await _suspend(session, user_id, body.reason, admin, client_ip(request))
    await session.commit()
    return S.AdminUser.model_validate(user)


@router.post("/users/{user_id}/unsuspend", response_model=S.AdminUser)
async def unsuspend(user_id: uuid.UUID, admin: AdminUser, session: Session, request: Request):
    user = await session.get(User, user_id)
    if user is None:
        raise not_found("user")
    user.status = "active"
    user.suspended_reason = None
    audit(session, "admin.user_unsuspend", "user", user.id, admin.id, client_ip(request))
    await session.commit()
    return S.AdminUser.model_validate(user)


# ---------- listings & reservations ----------


@router.get("/listings", response_model=S.Page[S.AdminListing])
async def listings(
    _: AdminUser,
    session: Session,
    status: str | None = Query(None, max_length=16),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    cond = [FoodListing.status == status] if status else []
    reps = select(func.count(Report.id)).where(Report.listing_id == FoodListing.id).scalar_subquery()
    total = await session.scalar(select(func.count(FoodListing.id)).where(*cond))
    rows = (
        await session.execute(
            select(FoodListing, reps).where(*cond).order_by(FoodListing.created_at.desc()).limit(limit).offset(offset)
        )
    ).unique().all()
    items = [
        S.AdminListing(
            id=l.id, food_type=l.food_type, servings=l.servings, status=l.status, pickup_method=l.pickup_method,
            area=l.area, address=l.address, good_until=l.good_until, created_at=l.created_at, donor_id=l.donor_id,
            donor_name=l.donor.name, donor_phone=l.donor.phone, reports_count=rc,
        )
        for l, rc in rows
    ]
    return _page(items, total, limit, offset)


async def _remove_listing(session, listing_id: uuid.UUID, admin, reason: str) -> FoodListing:
    listing = await lock_listing(session, listing_id)
    if listing.status in ("available", "reserved"):
        res = await session.scalar(
            select(Reservation).where(Reservation.listing_id == listing.id, Reservation.status == "active")
        )
        if res is not None:
            res.status = "cancelled_by_donor"
            res.cancelled_at = utcnow()
            res.cancel_reason = f"removed by admin: {reason}"
            notify(session, res.collector_id, "listing_removed", {"listing_id": str(listing.id)})
        notify(session, listing.donor_id, "listing_removed", {"listing_id": str(listing.id)})
    listing.status = "removed"
    listing.status_changed_at = utcnow()
    audit(session, "admin.listing_remove", "listing", listing.id, admin.id, reason=reason)
    return listing


@router.post("/listings/{listing_id}/remove", status_code=204)
async def remove_listing(listing_id: uuid.UUID, body: S.ReasonIn, admin: AdminUser, session: Session):
    await _remove_listing(session, listing_id, admin, body.reason)
    await session.commit()


def _res_query(status: str | None):
    donor = aliased(User)
    q = (
        select(Reservation, FoodListing, donor)
        .join(FoodListing, FoodListing.id == Reservation.listing_id)
        .join(donor, donor.id == FoodListing.donor_id)
    )
    return q.where(Reservation.status == status) if status else q


def _admin_res(r: Reservation, l: FoodListing, d: User) -> S.AdminReservation:
    return S.AdminReservation(
        id=r.id, status=r.status, for_whom=r.for_whom, created_at=r.created_at, completed_at=r.completed_at,
        cancelled_at=r.cancelled_at, listing_id=l.id, servings=l.servings, food_type=l.food_type,
        pickup_method=l.pickup_method, area=l.area, donor_name=d.name, donor_phone=d.phone,
        collector_name=r.collector.name, collector_phone=r.collector.phone,
    )


@router.get("/reservations", response_model=S.Page[S.AdminReservation])
async def reservations(
    _: AdminUser,
    session: Session,
    status: str | None = Query(None, max_length=24),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """All reservations. Use status=completed for collection records."""
    q = _res_query(status)
    total = await session.scalar(select(func.count()).select_from(q.subquery()))
    order = Reservation.completed_at.desc().nulls_last() if status == "completed" else Reservation.created_at.desc()
    rows = (await session.execute(q.order_by(order).limit(limit).offset(offset))).unique().all()
    return _page([_admin_res(*row) for row in rows], total, limit, offset)


# ---------- NGOs ----------


@router.get("/ngos", response_model=S.Page[S.AdminNgo])
async def ngos(
    _: AdminUser,
    session: Session,
    status: str | None = Query(None, pattern="^(pending|verified|rejected)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    cond = [Ngo.status == status] if status else []
    needs = select(func.count(NgoNeed.id)).where(NgoNeed.ngo_id == Ngo.id).scalar_subquery()
    total = await session.scalar(select(func.count(Ngo.id)).where(*cond))
    rows = (
        await session.execute(select(Ngo, needs).where(*cond).order_by(Ngo.submitted_at.asc()).limit(limit).offset(offset))
    ).unique().all()
    items = [
        S.AdminNgo(**ngo_out(n).model_dump(), owner_id=n.owner_id, owner_phone=n.owner.phone, needs_count=c)
        for n, c in rows
    ]
    return _page(items, total, limit, offset)


@router.get("/ngos/{ngo_id}/certificate", response_class=FileResponse)
async def ngo_certificate(ngo_id: uuid.UUID, _: AdminUser, session: Session):
    ngo = await session.get(Ngo, ngo_id)
    if ngo is None or not ngo.certificate_path:
        raise not_found("certificate")
    return FileResponse(
        uploads.resolve(ngo.certificate_path),
        media_type=ngo.certificate_mime,
        headers={"Content-Disposition": "inline", "Cache-Control": "no-store"},
    )


@router.post("/ngos/{ngo_id}/verify", response_model=S.AdminNgo)
async def verify_ngo(ngo_id: uuid.UUID, admin: AdminUser, session: Session, request: Request):
    ngo = await session.get(Ngo, ngo_id)
    if ngo is None:
        raise not_found("NGO")
    ngo.status = "verified"
    ngo.verified_at = utcnow()
    ngo.verified_by = admin.id
    ngo.rejection_reason = None
    notify(session, ngo.owner_id, "ngo_verified", {"ngo_id": str(ngo.id)}, ngo=ngo.name)
    audit(session, "admin.ngo_verify", "ngo", ngo.id, admin.id, client_ip(request))
    await session.commit()
    await sms.send_text(ngo.contact_phone, {"ngo": ngo.name[:30], "status": "verified"})
    return S.AdminNgo(**ngo_out(ngo).model_dump(), owner_id=ngo.owner_id, owner_phone=ngo.owner.phone)


@router.post("/ngos/{ngo_id}/reject", response_model=S.AdminNgo)
async def reject_ngo(ngo_id: uuid.UUID, body: S.ReasonIn, admin: AdminUser, session: Session, request: Request):
    ngo = await session.get(Ngo, ngo_id)
    if ngo is None:
        raise not_found("NGO")
    ngo.status = "rejected"
    ngo.rejection_reason = body.reason
    ngo.verified_at = None
    await session.execute(update(NgoNeed).where(NgoNeed.ngo_id == ngo.id).values(status="closed"))
    notify(session, ngo.owner_id, "ngo_rejected", {"ngo_id": str(ngo.id)}, ngo=ngo.name, reason=body.reason)
    audit(session, "admin.ngo_reject", "ngo", ngo.id, admin.id, client_ip(request), reason=body.reason)
    await session.commit()
    await sms.send_text(ngo.contact_phone, {"ngo": ngo.name[:30], "status": "needs changes"})
    return S.AdminNgo(**ngo_out(ngo).model_dump(), owner_id=ngo.owner_id, owner_phone=ngo.owner.phone)


# ---------- reports ----------


@router.get("/reports", response_model=S.Page[S.AdminReport])
async def reports(
    _: AdminUser,
    session: Session,
    status: str | None = Query("open", pattern="^(open|actioned|dismissed)$"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    reporter, target = aliased(User), aliased(User)
    cond = [Report.status == status] if status else []
    total = await session.scalar(select(func.count(Report.id)).where(*cond))
    rows = (
        await session.execute(
            select(Report, reporter, FoodListing, target)
            .join(reporter, reporter.id == Report.reporter_id)
            .outerjoin(FoodListing, FoodListing.id == Report.listing_id)
            .outerjoin(target, target.id == Report.user_id)
            .where(*cond)
            .order_by(Report.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).unique().all()
    items = [
        S.AdminReport(
            id=r.id, reason=r.reason, details=r.details, status=r.status, created_at=r.created_at,
            resolved_at=r.resolved_at, resolution_note=r.resolution_note, reporter_id=rep.id, reporter_name=rep.name,
            listing_id=l.id if l else None, listing_status=l.status if l else None, listing_area=l.area if l else None,
            user_id=t.id if t else (l.donor_id if l else None), user_name=t.name if t else (l.donor.name if l else None),
            user_status=t.status if t else (l.donor.status if l else None),
        )
        for r, rep, l, t in rows
    ]
    return _page(items, total, limit, offset)


@router.post("/reports/{report_id}/resolve", response_model=S.ReportOut)
async def resolve_report(report_id: uuid.UUID, body: S.ResolveReportIn, admin: AdminUser, session: Session, request: Request):
    r = await session.get(Report, report_id)
    if r is None:
        raise not_found("report")
    if r.status != "open":
        raise conflict("report_closed", "This report was already handled.")
    note = body.note or body.action
    if body.action == "remove_listing":
        if r.listing_id is None:
            raise AppError(422, "no_listing", "This report is not about a food post.")
        await _remove_listing(session, r.listing_id, admin, note)
    elif body.action == "suspend_user":
        target_id = r.user_id
        if target_id is None and r.listing_id is not None:
            target_id = (await session.get(FoodListing, r.listing_id)).donor_id
        if target_id is None:
            raise AppError(422, "no_user", "No person to suspend for this report.")
        await _suspend(session, target_id, f"report: {note}"[:300], admin, client_ip(request))
    r.status = "dismissed" if body.action == "dismiss" else "actioned"
    r.resolution_note = note
    r.resolved_by = admin.id
    r.resolved_at = utcnow()
    audit(session, "admin.report_resolve", "report", r.id, admin.id, client_ip(request), resolution=body.action)
    await session.commit()
    return r


@router.get("/audit", response_model=S.Page[S.AuditOut])
async def audit_log(
    _: AdminUser,
    session: Session,
    entity_type: str | None = Query(None, max_length=30),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    cond = [AuditLog.entity_type == entity_type] if entity_type else []
    total = await session.scalar(select(func.count(AuditLog.id)).where(*cond))
    rows = (await session.scalars(select(AuditLog).where(*cond).order_by(AuditLog.id.desc()).limit(limit).offset(offset))).all()
    return _page(rows, total, limit, offset)
