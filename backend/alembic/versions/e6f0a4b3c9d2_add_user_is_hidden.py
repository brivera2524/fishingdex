"""add user is_hidden column

Revision ID: e6f0a4b3c9d2
Revises: d5e9f3a2b8c1
Create Date: 2026-07-06 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e6f0a4b3c9d2'
down_revision: Union[str, None] = 'd5e9f3a2b8c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("users", "is_hidden")
