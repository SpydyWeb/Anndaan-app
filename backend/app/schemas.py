import re
import uuid
from datetime import date, datetime, time
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator

T = TypeVar("T")

FoodType = Literal["veg", "nonveg"]
PickupMethod = Literal["door", "guard"]
ListingStatus = Literal["available", "reserved", "collected", "cancelled", "expired", "removed"]
ForWhom = Literal["me", "family", "needy", "animals"]
ReservationStatus = Literal["active", "completed", "cancelled_by_collector", "cancelled_by_donor", "expired"]
Language = Literal["both", "en", "hi"]
NgoStatus = Literal["pending", "verified", "rejected"]
Meal = Literal["breakfast", "lunch", "dinner"]
Frequency = Literal["once", "daily", "weekly", "monthly"]
FoodPref = Literal["veg", "any"]
Delivery = Literal["drop_off", "collect"]
PledgeStatus = Literal["pledged", "received", "cancelled"]
ReportReason = Literal["unsafe_food", "not_as_described", "no_show", "abusive", "fake", "other"]
ReviewTag = Literal["fresh", "packed_well", "on_time", "polite", "easy_to_find"]

PHONE_RE = re.compile(r"^\+91[6-9]\d{9}$")


def normalize_phone(v: str) -> str:
    digits = re.sub(r"[\s\-()]", "", v or "")
    if digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if re.fullmatch(r"[6-9]\d{9}", digits):
        digits = "+91" + digits
    elif re.fullmatch(r"91[6-9]\d{9}", digits):
        digits = "+" + digits
    if not PHONE_RE.fullmatch(digits):
        raise ValueError("Enter a valid 10-digit Indian mobile number")
    return digits


def _clean(v: str | None) -> str | None:
    if v is None:
        return None
    v = re.sub(r"\s+", " ", v).strip()
    return v or None


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(ApiModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class ErrorBody(BaseModel):
    code: str
    message: str
    details: object | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


# ---------- auth ----------


class OtpRequestIn(BaseModel):
    phone: str

    _p = field_validator("phone")(classmethod(lambda cls, v: normalize_phone(v)))


class OtpRequestOut(BaseModel):
    phone: str
    expires_in_seconds: int
    resend_after_seconds: int
    dev_code: str | None = Field(None, description="Only present when the server runs in OTP dev mode")


class OtpVerifyIn(BaseModel):
    phone: str
    code: str = Field(pattern=r"^\d{4,8}$")
    name: str | None = Field(None, max_length=80)

    _p = field_validator("phone")(classmethod(lambda cls, v: normalize_phone(v)))
    _n = field_validator("name")(classmethod(lambda cls, v: _clean(v)))


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=200)


class NgoBrief(ApiModel):
    id: uuid.UUID
    name: str
    status: NgoStatus


class MeOut(ApiModel):
    id: uuid.UUID
    phone: str
    name: str | None
    area: str | None
    language: Language
    role: Literal["member", "admin"]
    status: Literal["active", "suspended"]
    created_at: datetime
    ngo: NgoBrief | None = None


class TokenPair(BaseModel):
    access_token: str
    access_expires_at: datetime
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    user: MeOut
    is_new_user: bool = False


class MeUpdateIn(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=80)
    area: str | None = Field(None, max_length=120)
    language: Language | None = None

    _n = field_validator("name", "area")(classmethod(lambda cls, v: _clean(v)))


class PushTokenIn(BaseModel):
    token: str = Field(pattern=r"^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_\-]+\]$", max_length=200)
    platform: Literal["ios", "android", "web"] | None = None


class ImpactStats(BaseModel):
    meals_shared: int
    people_fed: int
    meals_collected: int
    ngo_meals_given: int
    rating: float | None
    review_count: int
    since_year: int


# ---------- listings ----------


class ListingCreateIn(BaseModel):
    food_type: FoodType
    servings: int = Field(ge=1, le=500)
    good_until: datetime
    cooked_at: datetime | None = None
    note: str | None = Field(None, max_length=280)
    pickup_method: PickupMethod
    address: str = Field(min_length=5, max_length=300)
    area: str = Field(min_length=2, max_length=120)
    lat: float = Field(ge=6.0, le=38.0, description="India bounding box")
    lng: float = Field(ge=68.0, le=98.0)

    _c = field_validator("note", "address", "area")(classmethod(lambda cls, v: _clean(v)))


class ListingUpdateIn(BaseModel):
    food_type: FoodType | None = None
    servings: int | None = Field(None, ge=1, le=500)
    good_until: datetime | None = None
    note: str | None = Field(None, max_length=280)
    pickup_method: PickupMethod | None = None
    address: str | None = Field(None, min_length=5, max_length=300)
    area: str | None = Field(None, min_length=2, max_length=120)
    lat: float | None = Field(None, ge=6.0, le=38.0)
    lng: float | None = Field(None, ge=68.0, le=98.0)

    _c = field_validator("note", "address", "area")(classmethod(lambda cls, v: _clean(v)))


class ReactivateIn(BaseModel):
    good_until: datetime | None = None


class PersonBrief(BaseModel):
    id: uuid.UUID
    display_name: str
    rating: float | None
    review_count: int


class ImageOut(BaseModel):
    id: uuid.UUID
    url: str
    width: int
    height: int


class ListingCard(BaseModel):
    id: uuid.UUID
    food_type: FoodType
    servings: int
    good_until: datetime
    pickup_method: PickupMethod
    area: str
    status: ListingStatus
    distance_km: float | None
    donor: PersonBrief
    image: ImageOut | None = None
    created_at: datetime


class ReviewOut(BaseModel):
    id: uuid.UUID
    author_name: str
    stars: int
    tags: list[str]
    comment: str | None
    created_at: datetime


class ListingDetail(ListingCard):
    cooked_at: datetime | None
    note: str | None
    images: list[ImageOut]
    latest_review: ReviewOut | None
    donor_meals_shared: int
    # Only for the donor, or the collector holding the active reservation:
    address: str | None = None
    donor_phone: str | None = None
    donor_full_name: str | None = None
    is_mine: bool = False
    my_reservation_id: uuid.UUID | None = None
    current_reservation_id: uuid.UUID | None = Field(None, description="Donor only: the active or completed reservation")
    can_edit: bool = False


class ListingNearbyOut(BaseModel):
    items: list[ListingCard]
    total: int
    available_count: int
    limit: int
    offset: int


class ReservationCreateIn(BaseModel):
    for_whom: ForWhom
    eta_minutes: int | None = Field(None, ge=0, le=1440, description="null means 'before good-until'")
    idempotency_key: str | None = Field(None, min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_\-]+$")


class CounterpartOut(BaseModel):
    id: uuid.UUID
    name: str
    phone: str


class ReservationOut(BaseModel):
    id: uuid.UUID
    status: ReservationStatus
    for_whom: ForWhom
    eta_minutes: int | None
    expected_at: datetime
    created_at: datetime
    completed_at: datetime | None
    cancelled_at: datetime | None
    donor_confirmed_at: datetime | None
    collector_confirmed_at: datetime | None
    role: Literal["donor", "collector"]
    listing: ListingCard
    address: str | None  # only while active/completed, for participants
    collector: CounterpartOut | None  # visible to the donor
    donor: CounterpartOut | None  # visible to the collector
    pickup_code: str | None  # only to the collector, door pick-ups, while active
    code_attempts_left: int | None
    code_locked: bool = False
    can_review: bool = False
    my_review_id: uuid.UUID | None = None


class VerifyCodeIn(BaseModel):
    code: str = Field(pattern=r"^\d{4}$")


class MyListing(BaseModel):
    listing: ListingDetail
    active_reservation: ReservationOut | None


# ---------- reviews / profiles ----------


class ReviewIn(BaseModel):
    stars: int = Field(ge=1, le=5)
    tags: list[ReviewTag] = Field(default_factory=list, max_length=5)
    comment: str | None = Field(None, max_length=500)

    _c = field_validator("comment")(classmethod(lambda cls, v: _clean(v)))


class TagCount(BaseModel):
    tag: str
    count: int


class PublicProfile(BaseModel):
    id: uuid.UUID
    display_name: str
    area: str | None
    rating: float | None
    review_count: int
    meals_shared: int
    people_fed: int
    since_year: int
    top_tags: list[TagCount]
    reviews: list[ReviewOut]


# ---------- reports ----------


class ReportIn(BaseModel):
    listing_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    reason: ReportReason
    details: str | None = Field(None, max_length=1000)

    _c = field_validator("details")(classmethod(lambda cls, v: _clean(v)))


class ReportOut(ApiModel):
    id: uuid.UUID
    status: Literal["open", "actioned", "dismissed"]
    created_at: datetime


# ---------- notifications ----------


class NotificationOut(ApiModel):
    id: uuid.UUID
    kind: str
    title_en: str
    title_hi: str
    body_en: str
    body_hi: str
    data: dict
    read_at: datetime | None
    created_at: datetime


class MarkReadIn(BaseModel):
    ids: list[uuid.UUID] | None = Field(None, description="Omit to mark everything read")


# ---------- NGOs ----------


class NgoRegisterIn(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    registration_id: str = Field(min_length=4, max_length=60)
    contact_name: str = Field(min_length=2, max_length=80)
    contact_phone: str
    address: str = Field(min_length=5, max_length=300)
    area: str = Field(min_length=2, max_length=120)
    lat: float | None = Field(None, ge=6.0, le=38.0)
    lng: float | None = Field(None, ge=68.0, le=98.0)

    _p = field_validator("contact_phone")(classmethod(lambda cls, v: normalize_phone(v)))
    _c = field_validator("name", "contact_name", "address", "area")(classmethod(lambda cls, v: _clean(v)))

    @field_validator("registration_id")
    @classmethod
    def _reg(cls, v: str) -> str:
        v = v.strip().upper()
        if not re.fullmatch(r"[A-Z0-9/\-. ]{4,60}", v):
            raise ValueError("Use letters, numbers and / - . only")
        return v


class NgoOut(ApiModel):
    id: uuid.UUID
    name: str
    registration_id: str
    contact_name: str
    contact_phone: str
    address: str
    area: str
    status: NgoStatus
    has_certificate: bool
    submitted_at: datetime
    verified_at: datetime | None
    rejection_reason: str | None


class NeedIn(BaseModel):
    meal: Meal
    people: int = Field(ge=1, le=2000)
    audience: str | None = Field(None, max_length=60, description="e.g. children, elderly")
    frequency: Frequency
    start_date: date
    end_date: date | None = None
    meal_time: time
    food_pref: FoodPref

    _c = field_validator("audience")(classmethod(lambda cls, v: _clean(v)))


class NeedUpdateIn(BaseModel):
    status: Literal["open", "closed"]


class NgoPublic(BaseModel):
    id: uuid.UUID
    name: str
    verified: bool
    area: str


class Occurrence(BaseModel):
    date: date
    covered: int
    remaining: int


class NeedCard(BaseModel):
    id: uuid.UUID
    ngo: NgoPublic
    meal: Meal
    people: int
    audience: str | None
    frequency: Frequency
    start_date: date
    end_date: date | None
    meal_time: time
    food_pref: FoodPref
    status: Literal["open", "closed"]
    next: Occurrence | None
    distance_km: float | None


class NeedDetail(NeedCard):
    upcoming: list[Occurrence]
    address: str


class PledgeIn(BaseModel):
    people: int = Field(ge=1, le=2000)
    for_date: date
    delivery: Delivery


class PledgeOut(BaseModel):
    id: uuid.UUID
    status: PledgeStatus
    people: int
    for_date: date
    delivery: Delivery
    created_at: datetime
    received_at: datetime | None
    need: NeedCard
    occurrence: Occurrence
    ngo_contact_phone: str
    ngo_address: str
    donor_name: str | None = None
    donor_phone: str | None = None


# ---------- admin ----------


class AdminStats(BaseModel):
    users_total: int
    users_new_7d: int
    users_suspended: int
    listings_available: int
    listings_reserved: int
    listings_total: int
    collections_total: int
    collections_7d: int
    people_fed_total: int
    reservations_active: int
    ngos_pending: int
    ngos_verified: int
    reports_open: int
    pledges_total: int


class AdminUser(ApiModel):
    id: uuid.UUID
    phone: str
    name: str | None
    area: str | None
    role: str
    status: str
    suspended_reason: str | None
    created_at: datetime
    last_seen_at: datetime | None
    listings_count: int = 0
    reservations_count: int = 0
    reports_against: int = 0


class AdminListing(BaseModel):
    id: uuid.UUID
    food_type: FoodType
    servings: int
    status: ListingStatus
    pickup_method: PickupMethod
    area: str
    address: str
    good_until: datetime
    created_at: datetime
    donor_id: uuid.UUID
    donor_name: str | None
    donor_phone: str
    reports_count: int


class AdminReservation(BaseModel):
    id: uuid.UUID
    status: ReservationStatus
    for_whom: ForWhom
    created_at: datetime
    completed_at: datetime | None
    cancelled_at: datetime | None
    listing_id: uuid.UUID
    servings: int
    food_type: FoodType
    pickup_method: PickupMethod
    area: str
    donor_name: str | None
    donor_phone: str
    collector_name: str | None
    collector_phone: str


class AdminNgo(NgoOut):
    owner_id: uuid.UUID
    owner_phone: str
    needs_count: int = 0


class AdminReport(BaseModel):
    id: uuid.UUID
    reason: ReportReason
    details: str | None
    status: Literal["open", "actioned", "dismissed"]
    created_at: datetime
    resolved_at: datetime | None
    resolution_note: str | None
    reporter_id: uuid.UUID
    reporter_name: str | None
    listing_id: uuid.UUID | None
    listing_status: str | None
    listing_area: str | None
    user_id: uuid.UUID | None
    user_name: str | None
    user_status: str | None


class ResolveReportIn(BaseModel):
    action: Literal["dismiss", "remove_listing", "suspend_user"]
    note: str | None = Field(None, max_length=500)


class ReasonIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


class AuditOut(ApiModel):
    id: int
    actor_id: uuid.UUID | None
    action: str
    entity_type: str
    entity_id: str | None
    meta: dict
    created_at: datetime
