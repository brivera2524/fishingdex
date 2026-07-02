"""add tide fields to catches

Revision ID: 5e6eeeff09a7
Revises: 2a68ca53cceb
Create Date: 2026-07-01 21:40:09.221078

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5e6eeeff09a7'
down_revision: Union[str, None] = '2a68ca53cceb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("catches", sa.Column("tide_height_ft", sa.Float(), nullable=True))
    op.add_column("catches", sa.Column("tide_direction", sa.String(length=10), nullable=True))


def downgrade() -> None:
    op.drop_column("catches", "tide_direction")
    op.drop_column("catches", "tide_height_ft")
