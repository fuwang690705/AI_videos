import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from studio.core.database import Base


class Record:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class Project(Record, Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint(
            "production_type IN ('MANGA', 'MEME_ANIMATION', 'REALISTIC')",
            name="ck_project_production_type",
        ),
    )

    name: Mapped[str] = mapped_column(String(120))
    synopsis: Mapped[str] = mapped_column(Text, default="")
    production_type: Mapped[str] = mapped_column(String(32))
    profile_id: Mapped[str] = mapped_column(String(80))


class Episode(Record, Base):
    __tablename__ = "episodes"
    __table_args__ = (
        UniqueConstraint("project_id", "number", name="uq_episode_number"),
        CheckConstraint("number > 0", name="ck_episode_number"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(120))
    synopsis: Mapped[str] = mapped_column(Text, default="")


class Scene(Record, Base):
    __tablename__ = "scenes"
    __table_args__ = (
        UniqueConstraint("episode_id", "number", name="uq_scene_number"),
        CheckConstraint("number > 0", name="ck_scene_number"),
    )

    episode_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("episodes.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(120))
    location: Mapped[str] = mapped_column(String(200), default="")


class Shot(Record, Base):
    __tablename__ = "shots"
    __table_args__ = (
        UniqueConstraint("scene_id", "number", name="uq_shot_number"),
        CheckConstraint("number > 0", name="ck_shot_number"),
        CheckConstraint("duration_seconds BETWEEN 1 AND 120", name="ck_shot_duration"),
        CheckConstraint("revision > 0", name="ck_shot_revision"),
    )

    scene_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("scenes.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(120))
    visual_description: Mapped[str] = mapped_column(Text, default="")
    dialogue: Mapped[str] = mapped_column(Text, default="")
    duration_seconds: Mapped[int] = mapped_column(Integer, default=5)
    revision: Mapped[int] = mapped_column(Integer, default=1)
