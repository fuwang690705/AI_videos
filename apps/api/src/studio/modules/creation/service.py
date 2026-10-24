import hashlib
import json
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from studio.modules.catalog.models import Episode, Project, Scene, Shot
from studio.modules.catalog.schemas import ProjectCreate
from studio.modules.catalog.service import require_record
from studio.modules.creation.models import CreationImportRecord
from studio.modules.creation.schemas import (
    CreationEpisode,
    CreationImport,
    CreationScene,
    CreationShot,
    CreationSnapshot,
    ShotDetails,
)
from studio.modules.production.profiles import get_profile
from studio.modules.story.models import StoryDraft


def export_snapshot(db: Session, project_id: UUID) -> CreationSnapshot:
    project = require_record(db, Project, project_id)
    story = db.get(StoryDraft, project_id)
    archive = db.scalar(
        select(CreationImportRecord).where(CreationImportRecord.project_id == project_id)
    )
    details = archive.shot_details if archive else {}
    # Bulk reads keep snapshot export independent of hierarchy size (four catalog queries).
    episodes = db.scalars(
        select(Episode).where(Episode.project_id == project_id).order_by(Episode.number)
    ).all()
    scenes = db.scalars(
        select(Scene).join(Episode).where(Episode.project_id == project_id).order_by(Scene.number)
    ).all()
    shots = db.scalars(
        select(Shot)
        .join(Scene)
        .join(Episode)
        .where(Episode.project_id == project_id)
        .order_by(Shot.number)
    ).all()
    scene_shots: dict[UUID, list[CreationShot]] = {}
    for shot in shots:
        scene_shots.setdefault(shot.scene_id, []).append(
            CreationShot(
                id=shot.id,
                number=shot.number,
                title=shot.title,
                visual_description=shot.visual_description,
                dialogue=shot.dialogue,
                duration_seconds=shot.duration_seconds,
                details=ShotDetails.model_validate(details.get(str(shot.id), {})),
            )
        )
    episode_scenes: dict[UUID, list[CreationScene]] = {}
    for scene in scenes:
        episode_scenes.setdefault(scene.episode_id, []).append(
            CreationScene(
                id=scene.id,
                number=scene.number,
                title=scene.title,
                location=scene.location,
                shots=scene_shots.get(scene.id, []),
            )
        )
    return CreationSnapshot(
        schema_version=1,
        story=story.content if story else None,
        project=ProjectCreate(
            name=project.name,
            synopsis=project.synopsis,
            production_type=project.production_type,
            profile_id=project.profile_id,
        ),
        episodes=[
            CreationEpisode(
                id=episode.id,
                number=episode.number,
                title=episode.title,
                synopsis=episode.synopsis,
                scenes=episode_scenes.get(episode.id, []),
            )
            for episode in episodes
        ],
    )


def import_copy(db: Session, data: CreationImport) -> Project:
    fingerprint = hashlib.sha256(
        json.dumps(data.model_dump(mode="json"), sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()

    def previous_result(record):
        if record.fingerprint != fingerprint:
            raise HTTPException(status_code=409, detail="保存标识已被其他内容使用，请重新另存")
        return require_record(db, Project, record.project_id)

    previous = db.get(CreationImportRecord, data.request_id)
    if previous:
        return previous_result(previous)
    source = data.snapshot.project
    profile = get_profile(source.profile_id)
    if profile is None or profile.production_type != source.production_type:
        raise HTTPException(status_code=422, detail="生产配置不存在或与内容方向不匹配")
    project = Project(**{**source.model_dump(), "name": data.name})
    details = {}
    try:
        db.add(project)
        db.flush()
        if data.snapshot.story is not None:
            db.add(StoryDraft(project_id=project.id, content=data.snapshot.story.model_dump()))
        for episode_data in data.snapshot.episodes:
            episode = Episode(
                project_id=project.id,
                **episode_data.model_dump(exclude={"id", "scenes"}),
            )
            db.add(episode)
            db.flush()
            for scene_data in episode_data.scenes:
                scene = Scene(
                    episode_id=episode.id,
                    **scene_data.model_dump(exclude={"id", "shots"}),
                )
                db.add(scene)
                db.flush()
                for shot_data in scene_data.shots:
                    shot = Shot(
                        scene_id=scene.id,
                        **shot_data.model_dump(exclude={"id", "details"}),
                    )
                    db.add(shot)
                    db.flush()
                    details[str(shot.id)] = shot_data.details.model_dump()
        db.add(
            CreationImportRecord(
                request_id=data.request_id,
                project_id=project.id,
                fingerprint=fingerprint,
                shot_details=details,
            )
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # Concurrent retries of one request may race at the unique request_id.
        previous = db.get(CreationImportRecord, data.request_id)
        if previous:
            return previous_result(previous)
        raise HTTPException(status_code=409, detail="创作副本保存冲突，未写入部分内容") from exc
    except Exception:
        db.rollback()
        raise
    db.refresh(project)
    return project
