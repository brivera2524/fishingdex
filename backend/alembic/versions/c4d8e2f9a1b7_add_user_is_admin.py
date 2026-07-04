"""add user is_admin column

Revision ID: c4d8e2f9a1b7
Revises: b3f7d1a8c2e6
Create Date: 2026-07-05 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d8e2f9a1b7'
down_revision: Union[str, None] = 'b3f7d1a8c2e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Preserves current behavior — user id 1 was the hardcoded admin before
    # this column existed.
    op.execute("UPDATE users SET is_admin = true WHERE id = 1")


def downgrade() -> None:
    op.drop_column("users", "is_admin")
