"""add spot parking location

Revision ID: b3f7d1a8c2e6
Revises: 9a4d2e7c1f83
Create Date: 2026-07-04 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3f7d1a8c2e6'
down_revision: Union[str, None] = '9a4d2e7c1f83'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("spots", sa.Column("parking_lat", sa.Float(), nullable=True))
    op.add_column("spots", sa.Column("parking_lng", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("spots", "parking_lng")
    op.drop_column("spots", "parking_lat")
