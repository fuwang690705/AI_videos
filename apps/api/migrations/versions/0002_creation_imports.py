"""Atomic creation copies, editorial extensions and idempotent save requests."""

import sqlalchemy as sa
from alembic import op

revision = "0002_creation"
down_revision = "0001_catalog"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "creation_imports",
        sa.Column("request_id", sa.Uuid(), primary_key=True),
        sa.Column(
            "project_id",
            sa.Uuid(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("shot_details", sa.JSON(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("creation_imports")
