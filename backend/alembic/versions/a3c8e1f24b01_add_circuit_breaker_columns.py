"""add circuit breaker columns

Revision ID: a3c8e1f24b01
Revises: 9b06002f6d7f
Create Date: 2026-03-07 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3c8e1f24b01"
down_revision: Union[str, None] = "9b06002f6d7f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "legislators",
        sa.Column("consecutive_failures", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "legislators",
        sa.Column("circuit_open_until", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("legislators", "circuit_open_until")
    op.drop_column("legislators", "consecutive_failures")
