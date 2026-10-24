from datetime import UTC, datetime
from uuid import UUID

from pydantic import Field, field_serializer

from studio.modules.catalog.schemas import InputModel, Summary


class StoryContent(InputModel):
    source_text: str = Field(default="", max_length=100000)
    outline: Summary = ""
    world_setting: Summary = ""
    character_notes: Summary = ""
    continuity_notes: Summary = ""


class StoryUpdate(StoryContent):
    revision: int = Field(ge=0)


class StoryRead(StoryContent):
    project_id: UUID
    revision: int
    updated_at: datetime | None = None

    @field_serializer("updated_at")
    def serialize_updated(self, value: datetime | None) -> str | None:
        if value is None:
            return None
        return (value if value.tzinfo else value.replace(tzinfo=UTC)).isoformat()


class ScriptPreviewRequest(InputModel):
    revision: int = Field(ge=1)
