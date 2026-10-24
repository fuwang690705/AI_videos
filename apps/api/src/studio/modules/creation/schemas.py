from typing import Literal, Self
from uuid import UUID

from pydantic import Field, model_validator

from studio.modules.catalog.schemas import (
    EpisodeCreate,
    InputModel,
    Name,
    ProjectCreate,
    SceneCreate,
    ShotCreate,
    Summary,
)


class ShotDetails(InputModel):
    action_summary: Summary = ""
    shot_size: str = Field(default="", max_length=80)
    camera_movement: str = Field(default="none", max_length=80)
    special_technique: str = Field(default="none", max_length=80)


class CreationShot(ShotCreate):
    id: UUID
    # No rounding of upstream fractional durations at the import boundary.
    duration_seconds: int = Field(default=5, ge=1, le=120, strict=True)
    details: ShotDetails


class CreationScene(SceneCreate):
    id: UUID
    shots: list[CreationShot] = Field(max_length=5000)


class CreationEpisode(EpisodeCreate):
    id: UUID
    scenes: list[CreationScene] = Field(max_length=1000)


class CreationSnapshot(InputModel):
    schema_version: Literal[1]
    project: ProjectCreate
    episodes: list[CreationEpisode] = Field(max_length=100)

    @model_validator(mode="after")
    def validate_tree(self) -> Self:
        ids: set[UUID] = set()
        scenes = shots = 0

        def check_siblings(records):
            numbers: set[int] = set()
            for record in records:
                if record.id in ids or record.number in numbers:
                    raise ValueError("快照中存在重复 ID 或同级编号")
                ids.add(record.id)
                numbers.add(record.number)

        check_siblings(self.episodes)
        for episode in self.episodes:
            check_siblings(episode.scenes)
            scenes += len(episode.scenes)
            for scene in episode.scenes:
                check_siblings(scene.shots)
                shots += len(scene.shots)
        if scenes > 1000 or shots > 5000:
            raise ValueError("单次创作快照最多 100 集、1000 场景、5000 分镜")
        if len(self.model_dump_json().encode()) > 4_000_000:
            raise ValueError("创作文本快照不能超过 4 MB")
        return self


class CreationImport(InputModel):
    request_id: UUID
    name: Name
    snapshot: CreationSnapshot
