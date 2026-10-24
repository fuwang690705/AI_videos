from datetime import UTC, datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_validator

from studio.modules.catalog.schemas import InputModel, RecordRead


class AssetRead(RecordRead):
    project_id: UUID
    kind: Literal["image", "audio"]
    filename: str
    sha256: str
    source_sha256: str
    byte_size: int
    codec: str
    width: int | None
    height: int | None
    duration_ms: int | None
    source_note: str


class BindingUpdate(InputModel):
    revision: int = Field(ge=0)
    image_asset_id: UUID | None = None
    audio_asset_id: UUID | None = None


class BindingRead(BindingUpdate):
    model_config = ConfigDict(from_attributes=True)
    shot_id: UUID


class MediaReference(InputModel):
    shot_id: UUID
    image_asset_id: UUID | None = None
    audio_asset_id: UUID | None = None


class MediaSnapshot(InputModel):
    source_project_id: UUID
    bindings: list[MediaReference] = Field(max_length=5000)


class RenderCreate(InputModel):
    request_id: UUID
    episode_id: UUID
    orientation: Literal["landscape", "portrait"] = "landscape"


class RenderRead(RecordRead):
    project_id: UUID
    episode_id: UUID
    status: Literal["queued", "running", "succeeded", "failed"]
    completed_shots: int
    total_shots: int
    duration_ms: int
    width: int
    height: int
    finished_at: datetime | None
    error: str
    output_sha256: str | None
    review_status: Literal["pending", "approved", "changes_requested"]

    @field_serializer("finished_at")
    def serialize_finished(self, value: datetime | None) -> str | None:
        if value is None:
            return None
        return (value if value.tzinfo else value.replace(tzinfo=UTC)).isoformat()


class ReviewCreate(InputModel):
    decision: Literal["approved", "changes_requested"]
    note: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def require_reason(self) -> Self:
        if self.decision == "changes_requested" and not self.note.strip():
            raise ValueError("退回修改需要填写原因")
        return self


class ReviewRead(RecordRead):
    job_id: UUID
    decision: str
    note: str


class MediaCapabilities(BaseModel):
    rendering_available: bool
    detail: str
    max_upload_bytes: int = 8 * 1024 * 1024
    max_render_seconds: int = 300
    max_render_shots: int = 100
