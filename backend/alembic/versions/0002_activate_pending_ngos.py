"""NGOs no longer wait for admin verification: activate any that were pending.

Revision ID: 0002_activate_pending_ngos
Revises: 76a8041d3172
Create Date: 2026-10-15
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0002_activate_pending_ngos"
down_revision: Union[str, Sequence[str], None] = "76a8041d3172"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE ngos SET status = 'verified', verified_at = COALESCE(verified_at, now()) WHERE status = 'pending'")


def downgrade() -> None:
    # Data-only change; there is no record of which NGOs were pending before.
    pass
