"""Persistent story source and creative notes with optimistic concurrency."""

import sqlalchemy as sa
from alembic import op

revision = "0003_story"
down_revision = "0002_creation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "story_drafts",
        sa.Column(
            "project_id",
            sa.Uuid(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("revision > 0", name="ck_story_revision"),
    )


def downgrade() -> None:
    op.drop_table("story_drafts")
