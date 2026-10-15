"""Database schema.

Enumerations are stored as short text columns guarded by CHECK constraints; that keeps
migrations simple (no ALTER TYPE) while still rejecting invalid states at the database.
"""

import uuid
from datetime import date, datetime, time

from geoalchemy2 import Geography
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _in(col: str, values: tuple[str, ...]) -> str:
    return f"{col} IN ({', '.join(repr(v) for v in values)})"


ROLES = ("member", "admin")
USER_STATUSES = ("active", "suspended")
LANGUAGES = ("both", "en", "hi")
FOOD_TYPES = ("veg", "nonveg")
PICKUP_METHODS = ("door", "guard")
LISTING_STATUSES = ("available", "reserved", "collected", "cancelled", "expired", "removed")
FOR_WHOM = ("me", "family", "needy", "animals")
RES_STATUSES = ("active", "completed", "cancelled_by_collector", "cancelled_by_donor", "expired")
NGO_STATUSES = ("pending", "verified", "rejected")
MEALS = ("breakfast", "lunch", "dinner")
FREQUENCIES = ("once", "daily", "weekly", "monthly")
FOOD_PREFS = ("veg", "any")
NEED_STATUSES = ("open", "closed")
DELIVERY = ("drop_off", "collect")
PLEDGE_STATUSES = ("pledged", "received", "cancelled")
REPORT_STATUSES = ("open", "actioned", "dismissed")
REPORT_REASONS = ("unsafe_food", "not_as_described", "no_show", "abusive", "fake", "other")
OTP_PURPOSES = ("login",)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(_in("role", ROLES), name="ck_users_role"),
        CheckConstraint(_in("status", USER_STATUSES), name="ck_users_status"),
        CheckConstraint(_in("language", LANGUAGES), name="ck_users_language"),
        CheckConstraint(r"phone ~ '^\+91[6-9][0-9]{9}$'", name="ck_users_phone_format"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone: Mapped[str] = mapped_column(String(16), unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(80))
    area: Mapped[str | None] = mapped_column(String(120))  # public locality, e.g. "Sector 15, Rohini"
    language: Mapped[str] = mapped_column(String(4), server_default="both", nullable=False)
    role: Mapped[str] = mapped_column(String(16), server_default="member", nullable=False)
    status: Mapped[str] = mapped_column(String(16), server_default="active", nullable=False)
    suspended_reason: Mapped[str | None] = mapped_column(Text)
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class OtpChallenge(Base):
    __tablename__ = "otp_challenges"
    __table_args__ = (
        CheckConstraint(_in("purpose", OTP_PURPOSES), name="ck_otp_purpose"),
        Index("ix_otp_phone_created", "phone", "created_at"),
        Index("ix_otp_ip_created", "ip", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone: Mapped[str] = mapped_column(String(16), nullable=False)
    purpose: Mapped[str] = mapped_column(String(16), server_default="login", nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    attempts: Mapped[int] = mapped_column(SmallInteger, server_default="0", nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ip: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AuthSession(Base):
    """One row per refresh token. Rotation links rows of the same family; reusing a
    rotated token revokes the whole family (stolen-token detection)."""

    __tablename__ = "auth_sessions"
    __table_args__ = (Index("ix_auth_sessions_user", "user_id"), Index("ix_auth_sessions_family", "family_id"))

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    family_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(256))
    ip: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class FoodListing(TimestampMixin, Base):
    __tablename__ = "food_listings"
    __table_args__ = (
        CheckConstraint(_in("food_type", FOOD_TYPES), name="ck_listing_food_type"),
        CheckConstraint(_in("pickup_method", PICKUP_METHODS), name="ck_listing_pickup_method"),
        CheckConstraint(_in("status", LISTING_STATUSES), name="ck_listing_status"),
        CheckConstraint("servings BETWEEN 1 AND 500", name="ck_listing_servings"),
        CheckConstraint("good_until > created_at", name="ck_listing_good_until"),
        Index("ix_listing_location", "location", postgresql_using="gist"),
        Index("ix_listing_status_until", "status", "good_until"),
        Index("ix_listing_donor", "donor_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    donor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    food_type: Mapped[str] = mapped_column(String(8), nullable=False)
    servings: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    cooked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    good_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    note: Mapped[str | None] = mapped_column(String(280))
    pickup_method: Mapped[str] = mapped_column(String(8), nullable=False)
    address: Mapped[str] = mapped_column(String(300), nullable=False)  # private until reserved
    area: Mapped[str] = mapped_column(String(120), nullable=False)  # public
    location = mapped_column(Geography(geometry_type="POINT", srid=4326, spatial_index=False), nullable=False)
    status: Mapped[str] = mapped_column(String(16), server_default="available", nullable=False)
    status_changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expiry_reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    donor: Mapped[User] = relationship(lazy="joined")
    images: Mapped[list["FoodImage"]] = relationship(lazy="selectin", order_by="FoodImage.created_at")


class FoodImage(Base):
    __tablename__ = "food_images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("food_listings.id", ondelete="CASCADE"), index=True, nullable=False
    )
    path: Mapped[str] = mapped_column(String(200), nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Reservation(TimestampMixin, Base):
    __tablename__ = "reservations"
    __table_args__ = (
        CheckConstraint(_in("status", RES_STATUSES), name="ck_res_status"),
        CheckConstraint(_in("for_whom", FOR_WHOM), name="ck_res_for_whom"),
        CheckConstraint("eta_minutes IS NULL OR eta_minutes BETWEEN 0 AND 1440", name="ck_res_eta"),
        # The core double-booking guard: at most one active reservation per listing.
        Index(
            "uq_res_one_active_per_listing",
            "listing_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        UniqueConstraint("collector_id", "idempotency_key", name="uq_res_idempotency"),
        Index("ix_res_collector", "collector_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("food_listings.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    collector_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    for_whom: Mapped[str] = mapped_column(String(10), nullable=False)
    eta_minutes: Mapped[int | None] = mapped_column(SmallInteger)  # NULL = "before good-until"
    expected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(24), server_default="active", nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(64))
    donor_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    collector_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(String(200))

    listing: Mapped[FoodListing] = relationship(lazy="joined")
    collector: Mapped[User] = relationship(lazy="joined")
    pickup: Mapped["PickupVerification | None"] = relationship(lazy="joined", uselist=False)


class PickupVerification(Base):
    """One-time 4-digit hand-over code for door pick-ups.

    The code is shown to the collector, typed by the donor, and stops working once
    used, after too many wrong tries, after expiry, or when the reservation ends."""

    __tablename__ = "pickup_verifications"
    __table_args__ = (CheckConstraint("attempts >= 0", name="ck_pickup_attempts"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reservation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("reservations.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    code: Mapped[str] = mapped_column(String(8), nullable=False)
    attempts: Mapped[int] = mapped_column(SmallInteger, server_default="0", nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("reservation_id", "author_id", name="uq_review_once"),
        CheckConstraint("stars BETWEEN 1 AND 5", name="ck_review_stars"),
        CheckConstraint("author_id <> subject_id", name="ck_review_not_self"),
        Index("ix_review_subject", "subject_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reservation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("reservations.id", ondelete="CASCADE"), nullable=False
    )
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    subject_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    stars: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(24)), server_default="{}", nullable=False)
    comment: Mapped[str | None] = mapped_column(String(500))
    hidden: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    author: Mapped[User] = relationship(foreign_keys=[author_id], lazy="joined")


class Ngo(TimestampMixin, Base):
    __tablename__ = "ngos"
    __table_args__ = (
        CheckConstraint(_in("status", NGO_STATUSES), name="ck_ngo_status"),
        Index("ix_ngo_location", "location", postgresql_using="gist"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), unique=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    name_hi: Mapped[str | None] = mapped_column(String(120))
    registration_id: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    certificate_path: Mapped[str | None] = mapped_column(String(200))
    certificate_mime: Mapped[str | None] = mapped_column(String(40))
    contact_name: Mapped[str] = mapped_column(String(80), nullable=False)
    contact_phone: Mapped[str] = mapped_column(String(16), nullable=False)
    address: Mapped[str] = mapped_column(String(300), nullable=False)
    area: Mapped[str] = mapped_column(String(120), nullable=False)
    location = mapped_column(Geography(geometry_type="POINT", srid=4326, spatial_index=False))
    status: Mapped[str] = mapped_column(String(12), server_default="pending", nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verified_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    rejection_reason: Mapped[str | None] = mapped_column(String(300))

    owner: Mapped[User] = relationship(foreign_keys=[owner_id], lazy="joined")


class NgoNeed(TimestampMixin, Base):
    __tablename__ = "ngo_needs"
    __table_args__ = (
        CheckConstraint(_in("meal", MEALS), name="ck_need_meal"),
        CheckConstraint(_in("frequency", FREQUENCIES), name="ck_need_frequency"),
        CheckConstraint(_in("food_pref", FOOD_PREFS), name="ck_need_food_pref"),
        CheckConstraint(_in("status", NEED_STATUSES), name="ck_need_status"),
        CheckConstraint("people BETWEEN 1 AND 2000", name="ck_need_people"),
        Index("ix_need_status", "status", "start_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ngo_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ngos.id", ondelete="CASCADE"), index=True, nullable=False)
    meal: Mapped[str] = mapped_column(String(10), nullable=False)
    people: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    audience: Mapped[str | None] = mapped_column(String(60))  # e.g. "children"
    frequency: Mapped[str] = mapped_column(String(8), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    meal_time: Mapped[time] = mapped_column(Time, nullable=False)
    food_pref: Mapped[str] = mapped_column(String(4), nullable=False)
    status: Mapped[str] = mapped_column(String(8), server_default="open", nullable=False)

    ngo: Mapped[Ngo] = relationship(lazy="joined")


class NgoPledge(TimestampMixin, Base):
    """A donor's commitment to feed N people for one occurrence of a need."""

    __tablename__ = "ngo_pledges"
    __table_args__ = (
        CheckConstraint(_in("delivery", DELIVERY), name="ck_pledge_delivery"),
        CheckConstraint(_in("status", PLEDGE_STATUSES), name="ck_pledge_status"),
        CheckConstraint("people BETWEEN 1 AND 2000", name="ck_pledge_people"),
        Index("ix_pledge_need_date", "need_id", "for_date"),
        Index("ix_pledge_donor", "donor_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    need_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ngo_needs.id", ondelete="CASCADE"), nullable=False)
    donor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    people: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    for_date: Mapped[date] = mapped_column(Date, nullable=False)
    delivery: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(10), server_default="pledged", nullable=False)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    need: Mapped[NgoNeed] = relationship(lazy="joined")
    donor: Mapped[User] = relationship(lazy="joined")


class Report(TimestampMixin, Base):
    __tablename__ = "reports"
    __table_args__ = (
        CheckConstraint(_in("status", REPORT_STATUSES), name="ck_report_status"),
        CheckConstraint(_in("reason", REPORT_REASONS), name="ck_report_reason"),
        CheckConstraint("listing_id IS NOT NULL OR user_id IS NOT NULL", name="ck_report_target"),
        Index("ix_report_status", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reporter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    listing_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("food_listings.id", ondelete="SET NULL"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reason: Mapped[str] = mapped_column(String(20), nullable=False)
    details: Mapped[str | None] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(10), server_default="open", nullable=False)
    resolution_note: Mapped[str | None] = mapped_column(String(500))
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notification_user", "user_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    title_en: Mapped[str] = mapped_column(String(120), nullable=False)
    title_hi: Mapped[str] = mapped_column(String(160), nullable=False)
    body_en: Mapped[str] = mapped_column(String(300), nullable=False)
    body_hi: Mapped[str] = mapped_column(String(400), nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, server_default="{}", nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pushed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class DevicePushToken(Base):
    __tablename__ = "device_push_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    token: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    platform: Mapped[str | None] = mapped_column(String(10))
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_entity", "entity_type", "entity_id"),
        Index("ix_audit_created", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64))
    meta: Mapped[dict] = mapped_column(JSONB, server_default="{}", nullable=False)
    ip: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
