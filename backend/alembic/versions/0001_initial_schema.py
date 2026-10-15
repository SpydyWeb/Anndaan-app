"""initial schema

Revision ID: 76a8041d3172
Revises: 
Create Date: 2026-10-14 21:01:50.042620
"""
from typing import Sequence, Union

from alembic import op
import geoalchemy2
import sqlalchemy as sa
from geoalchemy2 import Geography
from sqlalchemy.dialects import postgresql

revision: str = '76a8041d3172'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.create_table('otp_challenges',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('phone', sa.String(length=16), nullable=False),
    sa.Column('purpose', sa.String(length=16), server_default='login', nullable=False),
    sa.Column('code_hash', sa.String(length=64), nullable=False),
    sa.Column('attempts', sa.SmallInteger(), server_default='0', nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('consumed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('ip', postgresql.INET(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("purpose IN ('login')", name='ck_otp_purpose'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_otp_ip_created', 'otp_challenges', ['ip', 'created_at'], unique=False)
    op.create_index('ix_otp_phone_created', 'otp_challenges', ['phone', 'created_at'], unique=False)
    op.create_table('users',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('phone', sa.String(length=16), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=True),
    sa.Column('area', sa.String(length=120), nullable=True),
    sa.Column('language', sa.String(length=4), server_default='both', nullable=False),
    sa.Column('role', sa.String(length=16), server_default='member', nullable=False),
    sa.Column('status', sa.String(length=16), server_default='active', nullable=False),
    sa.Column('suspended_reason', sa.Text(), nullable=True),
    sa.Column('phone_verified_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("language IN ('both', 'en', 'hi')", name='ck_users_language'),
    sa.CheckConstraint("phone ~ '^\\+91[6-9][0-9]{9}$'", name='ck_users_phone_format'),
    sa.CheckConstraint("role IN ('member', 'admin')", name='ck_users_role'),
    sa.CheckConstraint("status IN ('active', 'suspended')", name='ck_users_status'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('phone')
    )
    op.create_table('audit_logs',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('actor_id', sa.UUID(), nullable=True),
    sa.Column('action', sa.String(length=60), nullable=False),
    sa.Column('entity_type', sa.String(length=30), nullable=False),
    sa.Column('entity_id', sa.String(length=64), nullable=True),
    sa.Column('meta', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('ip', postgresql.INET(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_audit_created', 'audit_logs', ['created_at'], unique=False)
    op.create_index('ix_audit_entity', 'audit_logs', ['entity_type', 'entity_id'], unique=False)
    op.create_table('auth_sessions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('family_id', sa.UUID(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('rotated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('user_agent', sa.String(length=256), nullable=True),
    sa.Column('ip', postgresql.INET(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )
    op.create_index('ix_auth_sessions_family', 'auth_sessions', ['family_id'], unique=False)
    op.create_index('ix_auth_sessions_user', 'auth_sessions', ['user_id'], unique=False)
    op.create_table('device_push_tokens',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('token', sa.String(length=200), nullable=False),
    sa.Column('platform', sa.String(length=10), nullable=True),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token')
    )
    op.create_index(op.f('ix_device_push_tokens_user_id'), 'device_push_tokens', ['user_id'], unique=False)
    op.create_geospatial_table('food_listings',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('donor_id', sa.UUID(), nullable=False),
    sa.Column('food_type', sa.String(length=8), nullable=False),
    sa.Column('servings', sa.SmallInteger(), nullable=False),
    sa.Column('cooked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('good_until', sa.DateTime(timezone=True), nullable=False),
    sa.Column('note', sa.String(length=280), nullable=True),
    sa.Column('pickup_method', sa.String(length=8), nullable=False),
    sa.Column('address', sa.String(length=300), nullable=False),
    sa.Column('area', sa.String(length=120), nullable=False),
    sa.Column('location', Geography(geometry_type='POINT', srid=4326, dimension=2, spatial_index=False, from_text='ST_GeogFromText', name='geography', nullable=False), nullable=False),
    sa.Column('status', sa.String(length=16), server_default='available', nullable=False),
    sa.Column('status_changed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('expiry_reminder_sent_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("food_type IN ('veg', 'nonveg')", name='ck_listing_food_type'),
    sa.CheckConstraint("pickup_method IN ('door', 'guard')", name='ck_listing_pickup_method'),
    sa.CheckConstraint("status IN ('available', 'reserved', 'collected', 'cancelled', 'expired', 'removed')", name='ck_listing_status'),
    sa.CheckConstraint('good_until > created_at', name='ck_listing_good_until'),
    sa.CheckConstraint('servings BETWEEN 1 AND 500', name='ck_listing_servings'),
    sa.ForeignKeyConstraint(['donor_id'], ['users.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_listing_donor', 'food_listings', ['donor_id', 'created_at'], unique=False)
    op.create_geospatial_index('ix_listing_location', 'food_listings', ['location'], unique=False, postgresql_using='gist', postgresql_ops={})
    op.create_index('ix_listing_status_until', 'food_listings', ['status', 'good_until'], unique=False)
    op.create_geospatial_table('ngos',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('owner_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('name_hi', sa.String(length=120), nullable=True),
    sa.Column('registration_id', sa.String(length=60), nullable=False),
    sa.Column('certificate_path', sa.String(length=200), nullable=True),
    sa.Column('certificate_mime', sa.String(length=40), nullable=True),
    sa.Column('contact_name', sa.String(length=80), nullable=False),
    sa.Column('contact_phone', sa.String(length=16), nullable=False),
    sa.Column('address', sa.String(length=300), nullable=False),
    sa.Column('area', sa.String(length=120), nullable=False),
    sa.Column('location', Geography(geometry_type='POINT', srid=4326, dimension=2, spatial_index=False, from_text='ST_GeogFromText', name='geography'), nullable=True),
    sa.Column('status', sa.String(length=12), server_default='pending', nullable=False),
    sa.Column('submitted_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('verified_by', sa.UUID(), nullable=True),
    sa.Column('rejection_reason', sa.String(length=300), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("status IN ('pending', 'verified', 'rejected')", name='ck_ngo_status'),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['verified_by'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('owner_id'),
    sa.UniqueConstraint('registration_id')
    )
    op.create_geospatial_index('ix_ngo_location', 'ngos', ['location'], unique=False, postgresql_using='gist', postgresql_ops={})
    op.create_table('notifications',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('kind', sa.String(length=40), nullable=False),
    sa.Column('title_en', sa.String(length=120), nullable=False),
    sa.Column('title_hi', sa.String(length=160), nullable=False),
    sa.Column('body_en', sa.String(length=300), nullable=False),
    sa.Column('body_hi', sa.String(length=400), nullable=False),
    sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('pushed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_notification_user', 'notifications', ['user_id', 'created_at'], unique=False)
    op.create_table('food_images',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('listing_id', sa.UUID(), nullable=False),
    sa.Column('path', sa.String(length=200), nullable=False),
    sa.Column('width', sa.Integer(), nullable=False),
    sa.Column('height', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['listing_id'], ['food_listings.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_food_images_listing_id'), 'food_images', ['listing_id'], unique=False)
    op.create_table('ngo_needs',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('ngo_id', sa.UUID(), nullable=False),
    sa.Column('meal', sa.String(length=10), nullable=False),
    sa.Column('people', sa.SmallInteger(), nullable=False),
    sa.Column('audience', sa.String(length=60), nullable=True),
    sa.Column('frequency', sa.String(length=8), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=True),
    sa.Column('meal_time', sa.Time(), nullable=False),
    sa.Column('food_pref', sa.String(length=4), nullable=False),
    sa.Column('status', sa.String(length=8), server_default='open', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("food_pref IN ('veg', 'any')", name='ck_need_food_pref'),
    sa.CheckConstraint("frequency IN ('once', 'daily', 'weekly', 'monthly')", name='ck_need_frequency'),
    sa.CheckConstraint("meal IN ('breakfast', 'lunch', 'dinner')", name='ck_need_meal'),
    sa.CheckConstraint("status IN ('open', 'closed')", name='ck_need_status'),
    sa.CheckConstraint('people BETWEEN 1 AND 2000', name='ck_need_people'),
    sa.ForeignKeyConstraint(['ngo_id'], ['ngos.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_need_status', 'ngo_needs', ['status', 'start_date'], unique=False)
    op.create_index(op.f('ix_ngo_needs_ngo_id'), 'ngo_needs', ['ngo_id'], unique=False)
    op.create_table('reports',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('reporter_id', sa.UUID(), nullable=False),
    sa.Column('listing_id', sa.UUID(), nullable=True),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('reason', sa.String(length=20), nullable=False),
    sa.Column('details', sa.String(length=1000), nullable=True),
    sa.Column('status', sa.String(length=10), server_default='open', nullable=False),
    sa.Column('resolution_note', sa.String(length=500), nullable=True),
    sa.Column('resolved_by', sa.UUID(), nullable=True),
    sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("reason IN ('unsafe_food', 'not_as_described', 'no_show', 'abusive', 'fake', 'other')", name='ck_report_reason'),
    sa.CheckConstraint("status IN ('open', 'actioned', 'dismissed')", name='ck_report_status'),
    sa.CheckConstraint('listing_id IS NOT NULL OR user_id IS NOT NULL', name='ck_report_target'),
    sa.ForeignKeyConstraint(['listing_id'], ['food_listings.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['reporter_id'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['resolved_by'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_report_status', 'reports', ['status', 'created_at'], unique=False)
    op.create_table('reservations',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('listing_id', sa.UUID(), nullable=False),
    sa.Column('collector_id', sa.UUID(), nullable=False),
    sa.Column('for_whom', sa.String(length=10), nullable=False),
    sa.Column('eta_minutes', sa.SmallInteger(), nullable=True),
    sa.Column('expected_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('status', sa.String(length=24), server_default='active', nullable=False),
    sa.Column('idempotency_key', sa.String(length=64), nullable=True),
    sa.Column('donor_confirmed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('collector_confirmed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('cancel_reason', sa.String(length=200), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("for_whom IN ('me', 'family', 'needy', 'animals')", name='ck_res_for_whom'),
    sa.CheckConstraint("status IN ('active', 'completed', 'cancelled_by_collector', 'cancelled_by_donor', 'expired')", name='ck_res_status'),
    sa.CheckConstraint('eta_minutes IS NULL OR eta_minutes BETWEEN 0 AND 1440', name='ck_res_eta'),
    sa.ForeignKeyConstraint(['collector_id'], ['users.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['listing_id'], ['food_listings.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('collector_id', 'idempotency_key', name='uq_res_idempotency')
    )
    op.create_index('ix_res_collector', 'reservations', ['collector_id', 'created_at'], unique=False)
    op.create_index(op.f('ix_reservations_listing_id'), 'reservations', ['listing_id'], unique=False)
    op.create_index('uq_res_one_active_per_listing', 'reservations', ['listing_id'], unique=True, postgresql_where=sa.text("status = 'active'"))
    op.create_table('ngo_pledges',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('need_id', sa.UUID(), nullable=False),
    sa.Column('donor_id', sa.UUID(), nullable=False),
    sa.Column('people', sa.SmallInteger(), nullable=False),
    sa.Column('for_date', sa.Date(), nullable=False),
    sa.Column('delivery', sa.String(length=10), nullable=False),
    sa.Column('status', sa.String(length=10), server_default='pledged', nullable=False),
    sa.Column('received_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("delivery IN ('drop_off', 'collect')", name='ck_pledge_delivery'),
    sa.CheckConstraint("status IN ('pledged', 'received', 'cancelled')", name='ck_pledge_status'),
    sa.CheckConstraint('people BETWEEN 1 AND 2000', name='ck_pledge_people'),
    sa.ForeignKeyConstraint(['donor_id'], ['users.id'], ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['need_id'], ['ngo_needs.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_pledge_donor', 'ngo_pledges', ['donor_id', 'created_at'], unique=False)
    op.create_index('ix_pledge_need_date', 'ngo_pledges', ['need_id', 'for_date'], unique=False)
    op.create_table('pickup_verifications',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('reservation_id', sa.UUID(), nullable=False),
    sa.Column('code', sa.String(length=8), nullable=False),
    sa.Column('attempts', sa.SmallInteger(), server_default='0', nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('locked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('attempts >= 0', name='ck_pickup_attempts'),
    sa.ForeignKeyConstraint(['reservation_id'], ['reservations.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('reservation_id')
    )
    op.create_table('reviews',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('reservation_id', sa.UUID(), nullable=False),
    sa.Column('author_id', sa.UUID(), nullable=False),
    sa.Column('subject_id', sa.UUID(), nullable=False),
    sa.Column('stars', sa.SmallInteger(), nullable=False),
    sa.Column('tags', postgresql.ARRAY(sa.String(length=24)), server_default='{}', nullable=False),
    sa.Column('comment', sa.String(length=500), nullable=True),
    sa.Column('hidden', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('author_id <> subject_id', name='ck_review_not_self'),
    sa.CheckConstraint('stars BETWEEN 1 AND 5', name='ck_review_stars'),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['reservation_id'], ['reservations.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['subject_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('reservation_id', 'author_id', name='uq_review_once')
    )
    op.create_index('ix_review_subject', 'reviews', ['subject_id', 'created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_review_subject', table_name='reviews')
    op.drop_table('reviews')
    op.drop_table('pickup_verifications')
    op.drop_index('ix_pledge_need_date', table_name='ngo_pledges')
    op.drop_index('ix_pledge_donor', table_name='ngo_pledges')
    op.drop_table('ngo_pledges')
    op.drop_index('uq_res_one_active_per_listing', table_name='reservations', postgresql_where=sa.text("status = 'active'"))
    op.drop_index(op.f('ix_reservations_listing_id'), table_name='reservations')
    op.drop_index('ix_res_collector', table_name='reservations')
    op.drop_table('reservations')
    op.drop_index('ix_report_status', table_name='reports')
    op.drop_table('reports')
    op.drop_index(op.f('ix_ngo_needs_ngo_id'), table_name='ngo_needs')
    op.drop_index('ix_need_status', table_name='ngo_needs')
    op.drop_table('ngo_needs')
    op.drop_index(op.f('ix_food_images_listing_id'), table_name='food_images')
    op.drop_table('food_images')
    op.drop_index('ix_notification_user', table_name='notifications')
    op.drop_table('notifications')
    op.drop_geospatial_index('ix_ngo_location', table_name='ngos', postgresql_using='gist', column_name='location')
    op.drop_geospatial_table('ngos')
    op.drop_index('ix_listing_status_until', table_name='food_listings')
    op.drop_geospatial_index('ix_listing_location', table_name='food_listings', postgresql_using='gist', column_name='location')
    op.drop_index('ix_listing_donor', table_name='food_listings')
    op.drop_geospatial_table('food_listings')
    op.drop_index(op.f('ix_device_push_tokens_user_id'), table_name='device_push_tokens')
    op.drop_table('device_push_tokens')
    op.drop_index('ix_auth_sessions_user', table_name='auth_sessions')
    op.drop_index('ix_auth_sessions_family', table_name='auth_sessions')
    op.drop_table('auth_sessions')
    op.drop_index('ix_audit_entity', table_name='audit_logs')
    op.drop_index('ix_audit_created', table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_table('users')
    op.drop_index('ix_otp_phone_created', table_name='otp_challenges')
    op.drop_index('ix_otp_ip_created', table_name='otp_challenges')
    op.drop_table('otp_challenges')
