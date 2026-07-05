"""add catch_photos table

Revision ID: 1c9e69abe724
Revises: e6f0a4b3c9d2
Create Date: 2026-07-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1c9e69abe724'
down_revision: Union[str, None] = 'e6f0a4b3c9d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('catch_photos',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('catch_id', sa.Integer(), nullable=False),
    sa.Column('photo_url', sa.String(length=500), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['catch_id'], ['catches.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_catch_photos_catch_id'), 'catch_photos', ['catch_id'], unique=False)

    # Move every existing single photo_url into the new table as each catch's
    # position-0 (primary) photo before dropping the old column.
    op.execute(
        "INSERT INTO catch_photos (catch_id, photo_url, position, created_at) "
        "SELECT id, photo_url, 0, created_at FROM catches WHERE photo_url IS NOT NULL"
    )
    op.drop_column('catches', 'photo_url')


def downgrade() -> None:
    op.add_column('catches', sa.Column('photo_url', sa.String(length=500), nullable=True))
    op.execute(
        "UPDATE catches SET photo_url = ("
        "SELECT photo_url FROM catch_photos "
        "WHERE catch_photos.catch_id = catches.id "
        "ORDER BY position ASC LIMIT 1"
        ")"
    )
    op.drop_index(op.f('ix_catch_photos_catch_id'), table_name='catch_photos')
    op.drop_table('catch_photos')
