from datetime import datetime
from uuid import UUID

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from studio.core.database import Base
from studio.modules.catalog.models import Record


class MediaAsset(Record, Base):
    __tablename__ = "media_assets"
    __table_args__ = (CheckConstraint("kind IN ('image', 'audio')", name="ck_asset_kind"),)

    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(10))
    filename: Mapped[str] = mapped_column(String(200))
    storage_key: Mapped[str] = mapped_column(String(200))
    sha256: Mapped[str] = mapped_column(String(64))
    source_sha256: Mapped[str] = mapped_column(String(64))
    byte_size: Mapped[int] = mapped_column(Integer)
    codec: Mapped[str] = mapped_column(String(40))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    source_note: Mapped[str] = mapped_column(Text, default="")


class ShotMedia(Base):
    __tablename__ = "shot_media"
    __table_args__ = (CheckConstraint("revision > 0", name="ck_media_revision"),)
    shot_id: Mapped[UUID] = mapped_column(
        ForeignKey("shots.id", ondelete="CASCADE"), primary_key=True
    )
    image_asset_id: Mapped[UUID | None] = mapped_column(ForeignKey("media_assets.id"))
    audio_asset_id: Mapped[UUID | None] = mapped_column(ForeignKey("media_assets.id"))
    revision: Mapped[int] = mapped_column(Integer, default=1)


class RenderJob(Record, Base):
    __tablename__ = "render_jobs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued','running','succeeded','failed')", name="ck_render_status"
        ),
    )
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    episode_id: Mapped[UUID] = mapped_column(ForeignKey("episodes.id", ondelete="CASCADE"))
    request_id: Mapped[UUID] = mapped_column(Uuid, unique=True)
    request_fingerprint: Mapped[str] = mapped_column(String(64))
    input_snapshot: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="queued")
    completed_shots: Mapped[int] = mapped_column(Integer, default=0)
    total_shots: Mapped[int] = mapped_column(Integer)
    duration_ms: Mapped[int] = mapped_column(Integer)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    worker_token: Mapped[UUID | None] = mapped_column(Uuid)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str] = mapped_column(Text, default="")
    output_sha256: Mapped[str | None] = mapped_column(String(64))
    review_status: Mapped[str] = mapped_column(String(20), default="pending")


class RenderReview(Record, Base):
    __tablename__ = "render_reviews"
    job_id: Mapped[UUID] = mapped_column(
        ForeignKey("render_jobs.id", ondelete="CASCADE"), index=True
    )
    decision: Mapped[str] = mapped_column(String(20))
    note: Mapped[str] = mapped_column(Text, default="")
