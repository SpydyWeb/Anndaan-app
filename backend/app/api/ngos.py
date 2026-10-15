import uuid

from fastapi import APIRouter, File, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, null, select
from sqlalchemy.exc import IntegrityError

from .. import schemas as S
from ..deps import CurrentUser, Session, client_ip
from ..errors import conflict, forbidden, not_found
from ..models import Ngo, NgoNeed, NgoPledge
from ..security import utcnow
from ..services import food, uploads
from ..services import ngo as svc
from ..services.audit import audit

router = APIRouter(tags=["ngos"])


def ngo_out(ngo: Ngo) -> S.NgoOut:
    return S.NgoOut(
        id=ngo.id,
        name=ngo.name,
        registration_id=ngo.registration_id,
        contact_name=ngo.contact_name,
        contact_phone=ngo.contact_phone,
        address=ngo.address,
        area=ngo.area,
        status=ngo.status,
        has_certificate=ngo.certificate_path is not None,
        submitted_at=ngo.submitted_at,
        verified_at=ngo.verified_at,
        rejection_reason=ngo.rejection_reason,
    )


# ---------- public ----------


@router.get("/ngos/needs", response_model=S.Page[S.NeedCard])
async def list_needs(
    session: Session,
    lat: float | None = Query(None, ge=6.0, le=38.0),
    lng: float | None = Query(None, ge=68.0, le=98.0),
    radius_km: float = Query(25, gt=0, le=100),
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Open meal needs from active NGOs, nearest first when a location is given."""
    cond = [NgoNeed.status == "open", Ngo.status == "verified"]
    dist = None
    if lat is not None and lng is not None:
        pt = food.point(lat, lng)
        dist = func.ST_Distance(Ngo.location, pt)
        cond.append((Ngo.location.is_(None)) | func.ST_DWithin(Ngo.location, pt, radius_km * 1000))
    base = select(NgoNeed).join(Ngo, Ngo.id == NgoNeed.ngo_id).where(*cond)
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    if dist is not None:
        q = select(NgoNeed, dist.label("d")).order_by(dist.nulls_last(), NgoNeed.id)
    else:
        q = select(NgoNeed, null()).order_by(NgoNeed.created_at.desc(), NgoNeed.id)
    q = q.join(Ngo, Ngo.id == NgoNeed.ngo_id).where(*cond)
    rows = (await session.execute(q.limit(limit).offset(offset))).unique().all()
    needs = [r[0] for r in rows]
    cards = await svc.need_cards(session, needs, {r[0].id: r[1] for r in rows})
    return S.Page(items=cards, total=total, limit=limit, offset=offset)


@router.get("/ngos/needs/{need_id}", response_model=S.NeedDetail)
async def get_need(need_id: uuid.UUID, session: Session):
    need = await session.get(NgoNeed, need_id)
    if need is None or need.ngo.status != "verified":
        raise not_found("meal need")
    return await svc.need_detail(session, need)


@router.post("/ngos/needs/{need_id}/pledges", response_model=S.PledgeOut, status_code=201)
async def pledge(need_id: uuid.UUID, body: S.PledgeIn, user: CurrentUser, session: Session, request: Request):
    """Give meals for one date. Counted straight away; no accept/reject step."""
    p = await svc.pledge(session, user, need_id, body, client_ip(request))
    return await svc.pledge_out(session, p)


@router.get("/pledges/{pledge_id}", response_model=S.PledgeOut)
async def get_pledge(pledge_id: uuid.UUID, user: CurrentUser, session: Session):
    """For the donor who gave, and the NGO that receives."""
    p = await session.get(NgoPledge, pledge_id)
    if p is None or user.id not in (p.donor_id, p.need.ngo.owner_id):
        raise not_found("pledge")
    return await svc.pledge_out(session, p, include_donor=user.id == p.need.ngo.owner_id)


@router.post("/pledges/{pledge_id}/cancel", response_model=S.PledgeOut)
async def cancel_pledge(pledge_id: uuid.UUID, user: CurrentUser, session: Session, request: Request):
    p = await svc.cancel_pledge(session, user, pledge_id, client_ip(request))
    return await svc.pledge_out(session, p)


# ---------- my NGO ----------


async def _mine(session, user) -> Ngo:
    ngo = await session.scalar(select(Ngo).where(Ngo.owner_id == user.id))
    if ngo is None:
        raise not_found("NGO")
    return ngo


@router.post("/ngos", response_model=S.NgoOut, status_code=201)
async def register(body: S.NgoRegisterIn, user: CurrentUser, session: Session, request: Request):
    """Register an NGO. Active immediately: the owner's mobile number is already OTP-verified.
    Admins can pause an NGO later if it misuses the app."""
    if await session.scalar(select(Ngo.id).where(Ngo.owner_id == user.id)):
        raise conflict("ngo_exists", "You have already registered an NGO.")
    data = body.model_dump()
    lat, lng = data.pop("lat"), data.pop("lng")
    ngo = Ngo(id=uuid.uuid4(), owner_id=user.id, status="verified", verified_at=utcnow(), **data)
    if lat is not None and lng is not None:
        ngo.location = food.point(lat, lng)
    session.add(ngo)
    audit(session, "ngo.register", "ngo", ngo.id, user.id, client_ip(request))
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise conflict("registration_id_taken", "This registration number is already registered.")
    return ngo_out(await session.get(Ngo, ngo.id, populate_existing=True))


@router.get("/ngos/mine", response_model=S.NgoOut)
async def my_ngo(user: CurrentUser, session: Session):
    return ngo_out(await _mine(session, user))


@router.patch("/ngos/mine", response_model=S.NgoOut)
async def update_my_ngo(body: S.NgoRegisterIn, user: CurrentUser, session: Session, request: Request):
    """Update NGO details. A paused NGO stays paused until Anndaan support re-enables it."""
    ngo = await _mine(session, user)
    data = body.model_dump()
    lat, lng = data.pop("lat"), data.pop("lng")
    for k, v in data.items():
        setattr(ngo, k, v)
    if lat is not None and lng is not None:
        ngo.location = food.point(lat, lng)
    audit(session, "ngo.update", "ngo", ngo.id, user.id, client_ip(request))
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise conflict("registration_id_taken", "This registration number is already registered.")
    return ngo_out(await session.get(Ngo, ngo.id, populate_existing=True))


@router.post("/ngos/mine/certificate", response_model=S.NgoOut)
async def upload_certificate(user: CurrentUser, session: Session, request: Request, file: UploadFile = File(...)):
    """Optional registration certificate: PDF or photo, up to 5 MB. Only admins and the NGO can see it."""
    ngo = await _mine(session, user)
    old = ngo.certificate_path
    path, mime = await uploads.save_certificate(file)
    ngo.certificate_path, ngo.certificate_mime = path, mime
    audit(session, "ngo.certificate", "ngo", ngo.id, user.id, client_ip(request))
    await session.commit()
    uploads.delete(old)
    return ngo_out(ngo)


@router.get("/ngos/mine/certificate", response_class=FileResponse)
async def my_certificate(user: CurrentUser, session: Session):
    ngo = await _mine(session, user)
    if not ngo.certificate_path:
        raise not_found("certificate")
    return FileResponse(uploads.resolve(ngo.certificate_path), media_type=ngo.certificate_mime)


@router.post("/ngos/mine/needs", response_model=S.NeedCard, status_code=201)
async def post_need(body: S.NeedIn, user: CurrentUser, session: Session, request: Request):
    """Any active (not paused) NGO."""
    need = await svc.create_need(session, user, body, client_ip(request))
    return (await svc.need_cards(session, [need]))[0]


@router.get("/ngos/mine/needs", response_model=S.Page[S.NeedCard])
async def my_needs(user: CurrentUser, session: Session, limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0)):
    ngo = await _mine(session, user)
    q = select(NgoNeed).where(NgoNeed.ngo_id == ngo.id)
    total = await session.scalar(select(func.count()).select_from(q.subquery()))
    rows = (await session.scalars(q.order_by(NgoNeed.status.desc(), NgoNeed.created_at.desc()).limit(limit).offset(offset))).unique().all()
    return S.Page(items=await svc.need_cards(session, list(rows)), total=total, limit=limit, offset=offset)


@router.patch("/ngos/mine/needs/{need_id}", response_model=S.NeedCard)
async def update_need(need_id: uuid.UUID, body: S.NeedUpdateIn, user: CurrentUser, session: Session, request: Request):
    ngo = await _mine(session, user)
    need = await session.get(NgoNeed, need_id)
    if need is None or need.ngo_id != ngo.id:
        raise not_found("meal need")
    if body.status == "open" and ngo.status != "verified":
        raise forbidden("Your NGO is paused by Anndaan support.")
    need.status = body.status
    audit(session, f"need.{body.status}", "need", need.id, user.id, client_ip(request))
    await session.commit()
    return (await svc.need_cards(session, [need]))[0]


@router.get("/ngos/mine/pledges", response_model=S.Page[S.PledgeOut])
async def pledges_received(
    user: CurrentUser,
    session: Session,
    upcoming: bool = True,
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Meals donors have promised to this NGO (its donation history when upcoming=false)."""
    ngo = await _mine(session, user)
    q = select(NgoPledge).join(NgoNeed, NgoNeed.id == NgoPledge.need_id).where(NgoNeed.ngo_id == ngo.id)
    today = svc.today_ist()
    q = q.where(NgoPledge.for_date >= today) if upcoming else q.where(NgoPledge.for_date < today)
    total = await session.scalar(select(func.count()).select_from(q.subquery()))
    order = NgoPledge.for_date.asc() if upcoming else NgoPledge.for_date.desc()
    rows = (await session.scalars(q.order_by(order).limit(limit).offset(offset))).unique().all()
    return S.Page(items=[await svc.pledge_out(session, p, include_donor=True) for p in rows], total=total, limit=limit, offset=offset)


@router.post("/ngos/mine/pledges/{pledge_id}/received", response_model=S.PledgeOut)
async def mark_received(pledge_id: uuid.UUID, user: CurrentUser, session: Session, request: Request):
    ngo = await _mine(session, user)
    p = await session.get(NgoPledge, pledge_id)
    if p is None or p.need.ngo_id != ngo.id:
        raise not_found("pledge")
    if p.status == "cancelled":
        raise conflict("pledge_closed", "This pledge was cancelled by the donor.")
    if p.status != "received":
        p.status = "received"
        p.received_at = utcnow()
        audit(session, "pledge.received", "pledge", p.id, user.id, client_ip(request))
        await session.commit()
    return await svc.pledge_out(session, p, include_donor=True)
