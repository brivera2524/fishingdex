"""add catch counts_for_leaderboard column

Revision ID: d5e9f3a2b8c1
Revises: c4d8e2f9a1b7
Create Date: 2026-07-05 09:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5e9f3a2b8c1'
down_revision: Union[str, None] = 'c4d8e2f9a1b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "catches",
        sa.Column("counts_for_leaderboard", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("catches", "counts_for_leaderboard")
