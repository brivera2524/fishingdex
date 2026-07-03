"""add spots table

Revision ID: 7c1d4a9f2b56
Revises: 5e6eeeff09a7
Create Date: 2026-07-03 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c1d4a9f2b56'
down_revision: Union[str, None] = '5e6eeeff09a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "spots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("polygon", sa.JSON(), nullable=False),
        sa.Column("centroid_lat", sa.Float(), nullable=False),
        sa.Column("centroid_lng", sa.Float(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    # SQLite can't ALTER a foreign key constraint onto an existing table
    # directly — batch mode uses its copy-and-move strategy there, and is a
    # plain ALTER on Postgres, so this works on both.
    with op.batch_alter_table("catches") as batch_op:
        batch_op.add_column(
            sa.Column("spot_id", sa.Integer(), sa.ForeignKey("spots.id", name="fk_catches_spot_id"), nullable=True)
        )
        batch_op.create_index("ix_catches_spot_id", ["spot_id"])


def downgrade() -> None:
    with op.batch_alter_table("catches") as batch_op:
        batch_op.drop_index("ix_catches_spot_id")
        batch_op.drop_constraint("fk_catches_spot_id", type_="foreignkey")
        batch_op.drop_column("spot_id")
    op.drop_table("spots")
