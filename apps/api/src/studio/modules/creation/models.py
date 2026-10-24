from uuid import UUID

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import Uuid

from studio.core.database import Base


class CreationImportRecord(Base):
    __tablename__ = "creation_imports"

    request_id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), unique=True
    )
    fingerprint: Mapped[str] = mapped_column(String(64))
    # Only supported editorial fields, keyed by the NEW shot UUIDs. No API keys/media.
    shot_details: Mapped[dict] = mapped_column(JSON)
