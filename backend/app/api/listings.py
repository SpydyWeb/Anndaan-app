import uuid

from fastapi import APIRouter, File, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import case, func, select

from .. import schemas as S
from ..deps import CurrentUser, OptionalUser, Session, client_ip
from ..errors import AppError, conflict, forbidden, not_found
from ..models import FoodImage, FoodListing
from ..security import utcnow
from ..services import food, present, uploads
from ..services.audit import audit

router = APIRouter(tags=["food"])

MAX_PHOTOS = 3


@router.get("/listings/nearby", response_model=S.ListingNearbyOut)
async def nearby(
    session: Session,
    lat: float = Query(ge=6.0, le=38.0),
    lng: float = Query(ge=68.0, le=98.0),
    radius_km: float = Query(5.0, gt=0, le=25),
    food_type: S.FoodType | None = None,
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """Meals near a point, nearest first. No sign-in needed. Collected, cancelled and
    expired food never appears; reserved food stays visible but cannot be reserved.
    Exact addresses and coordinates are never included."""
    pt = food.point(lat, lng)
    dist = func.ST_Distance(FoodListing.location, pt)
    cond = [
        func.ST_DWithin(FoodListing.location, pt, radius_km * 1000),
        FoodListing.status.in_(("available", "reserved")),
        FoodListing.good_until > utcnow(),
    ]
    if food_type:
        cond.append(FoodListing.food_type == food_type)
    total, available = (
        await session.execute(
            select(func.count(), func.count(case((FoodListing.status == "available", 1)))).where(*cond)
        )
    ).one()
    rows = (
        await session.execute(
            select(FoodListing, dist.label("dist")).where(*cond).order_by(dist, FoodListing.id).limit(limit).offset(offset)
        )
    ).unique().all()
    rating = await present.ratings(session, {r[0].donor_id for r in rows})
    items = [present.card(listing, rating[listing.donor_id], d) for listing, d in rows]
    return S.ListingNearbyOut(items=items, total=total, available_count=available, limit=limit, offset=offset)


@router.post("/listings", response_model=S.ListingDetail, status_code=201)
async def create_listing(body: S.ListingCreateIn, user: CurrentUser, session: Session, request: Request):
    """Post surplus cooked food. Requires a verified number (any signed-in user)."""
    listing = await food.create_listing(session, user, body, client_ip(request))
    return await present.listing_detail(session, listing, user, None)


async def _distance(session, listing_id: uuid.UUID, lat: float | None, lng: float | None) -> float | None:
    if lat is None or lng is None:
        return None
    return await session.scalar(
        select(func.ST_Distance(FoodListing.location, food.point(lat, lng))).where(FoodListing.id == listing_id)
    )


@router.get("/listings/{listing_id}", response_model=S.ListingDetail)
async def get_listing(
    listing_id: uuid.UUID,
    session: Session,
    viewer: OptionalUser,
    lat: float | None = Query(None, ge=6.0, le=38.0),
    lng: float | None = Query(None, ge=68.0, le=98.0),
):
    listing = await session.get(FoodListing, listing_id)
    if listing is None or (listing.status == "removed" and (viewer is None or viewer.id != listing.donor_id)):
        raise not_found("food post")
    return await present.listing_detail(session, listing, viewer, await _distance(session, listing_id, lat, lng))


@router.patch("/listings/{listing_id}", response_model=S.ListingDetail)
async def update_listing(listing_id: uuid.UUID, body: S.ListingUpdateIn, user: CurrentUser, session: Session, request: Request):
    """Edit food that nobody has reserved yet."""
    listing = await food.update_listing(session, user, listing_id, body, client_ip(request))
    return await present.listing_detail(session, listing, user, None)


@router.post("/listings/{listing_id}/cancel", response_model=S.ListingDetail)
async def cancel_listing(listing_id: uuid.UUID, user: CurrentUser, session: Session, request: Request):
    """Take the food off the list. Any reservation is cancelled and the collector told."""
    listing = await food.cancel_listing(session, user, listing_id, client_ip(request))
    return await present.listing_detail(session, listing, user, None)


@router.post("/listings/{listing_id}/reactivate", response_model=S.ListingDetail)
async def reactivate(listing_id: uuid.UUID, body: S.ReactivateIn, user: CurrentUser, session: Session, request: Request):
    """'They didn't come': end the reservation (its code stops working) and relist."""
    listing = await food.reactivate_listing(session, user, listing_id, body, client_ip(request))
    return await present.listing_detail(session, listing, user, None)


@router.post("/listings/{listing_id}/images", response_model=S.ImageOut, status_code=201)
async def add_image(listing_id: uuid.UUID, user: CurrentUser, session: Session, request: Request, file: UploadFile = File(...)):
    """Optional food photo (JPEG/PNG/WebP, max 5 MB). Re-encoded; location metadata removed."""
    listing = await session.get(FoodListing, listing_id)
    if listing is None:
        raise not_found("food post")
    if listing.donor_id != user.id:
        raise forbidden()
    if listing.status not in ("available", "reserved"):
        raise conflict("listing_closed", "This food post is closed.")
    if len(listing.images) >= MAX_PHOTOS:
        raise AppError(422, "too_many_photos", f"Add up to {MAX_PHOTOS} photos.")
    path, w, h = await uploads.save_food_photo(file)
    img = FoodImage(listing_id=listing.id, path=path, width=w, height=h)
    session.add(img)
    audit(session, "listing.photo", "listing", listing.id, user.id, client_ip(request))
    await session.commit()
    return present.image_out(img)


@router.delete("/listings/{listing_id}/images/{image_id}", status_code=204)
async def delete_image(listing_id: uuid.UUID, image_id: uuid.UUID, user: CurrentUser, session: Session):
    img = await session.get(FoodImage, image_id)
    listing = await session.get(FoodListing, listing_id)
    if img is None or listing is None or img.listing_id != listing.id:
        raise not_found("photo")
    if listing.donor_id != user.id:
        raise forbidden()
    await session.delete(img)
    await session.commit()
    uploads.delete(img.path)
    return Response(status_code=204)


@router.get("/files/food/{image_id}", response_class=FileResponse)
async def food_image(image_id: uuid.UUID, session: Session):
    img = await session.get(FoodImage, image_id)
    if img is None:
        raise not_found("photo")
    listing = await session.get(FoodListing, img.listing_id)
    if listing is None or listing.status == "removed":
        raise not_found("photo")
    return FileResponse(uploads.resolve(img.path), media_type="image/jpeg", headers={"Cache-Control": "public, max-age=86400"})


@router.post("/listings/{listing_id}/reservations", response_model=S.ReservationOut, status_code=201)
async def reserve(
    listing_id: uuid.UUID, body: S.ReservationCreateIn, user: CurrentUser, session: Session, request: Request, response: Response
):
    """Reserve the whole portion. Safe under concurrency: exactly one person wins, others
    get 409 `listing_reserved`. Send an `idempotency_key` so a retried request returns the
    same reservation (200) instead of an error."""
    res, created = await food.reserve(session, user, listing_id, body, client_ip(request))
    if not created:
        response.status_code = 200
    return await present.reservation_out(session, res, user)
