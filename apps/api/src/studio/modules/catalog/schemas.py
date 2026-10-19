import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_serializer

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Summary = Annotated[str, StringConstraints(max_length=10000)]


class ProductionType(StrEnum):
    MANGA = "MANGA"
    MEME_ANIMATION = "MEME_ANIMATION"
    REALISTIC = "REALISTIC"


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProjectCreate(InputModel):
    name: Name
    synopsis: Summary = ""
    production_type: ProductionType
    profile_id: Annotated[str, StringConstraints(min_length=1, max_length=80)]


class EpisodeCreate(InputModel):
    number: int = Field(ge=1, le=100000)
    title: Name
    synopsis: Summary = ""


class SceneCreate(InputModel):
    number: int = Field(ge=1, le=100000)
    title: Name
    location: str = Field(default="", max_length=200)


class ShotContent(InputModel):
    title: Name
    visual_description: Summary = ""
    dialogue: Summary = ""
    duration_seconds: int = Field(default=5, ge=1, le=120)


class ShotCreate(ShotContent):
    number: int = Field(ge=1, le=100000)


class ShotUpdate(ShotContent):
    revision: int = Field(ge=1)


class RecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    created_at: datetime

    @field_serializer("created_at")
    def serialize_datetime(self, value: datetime) -> str:
        return (value if value.tzinfo else value.replace(tzinfo=UTC)).isoformat()


class ProjectRead(RecordRead):
    name: str
    synopsis: str
    production_type: ProductionType
    profile_id: str


class EpisodeRead(RecordRead):
    project_id: uuid.UUID
    number: int
    title: str
    synopsis: str


class ProjectPageRead(BaseModel):
    items: list[ProjectRead]
    total: int
    offset: int
    limit: int


class SceneRead(RecordRead):
    episode_id: uuid.UUID
    number: int
    title: str
    location: str


class ShotRead(RecordRead):
    scene_id: uuid.UUID
    number: int
    title: str
    visual_description: str
    dialogue: str
    duration_seconds: int
    revision: int


class OverviewRead(BaseModel):
    projects: int
    episodes: int
    scenes: int
    shots: int
