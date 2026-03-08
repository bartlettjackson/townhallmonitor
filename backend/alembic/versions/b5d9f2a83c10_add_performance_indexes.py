"""add performance indexes

Revision ID: b5d9f2a83c10
Revises: a3c8e1f24b01
Create Date: 2026-03-08 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b5d9f2a83c10"
down_revision: Union[str, None] = "a3c8e1f24b01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_event_date", "events", ["date"])
    op.create_index("ix_event_legislator_id", "events", ["legislator_id"])
    op.create_index("ix_legislator_chamber", "legislators", ["chamber"])


def downgrade() -> None:
    op.drop_index("ix_legislator_chamber", table_name="legislators")
    op.drop_index("ix_event_legislator_id", table_name="events")
    op.drop_index("ix_event_date", table_name="events")
