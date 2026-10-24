import hashlib
import json
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from studio.modules.catalog.models import Episode, Project, Scene, Shot
from studio.modules.catalog.service import require_record
from studio.modules.media.files import digest_file, media_path, require_tools
from studio.modules.media.models import RenderJob, ShotMedia
from studio.modules.media.schemas import RenderCreate
from studio.modules.media.service import project_asset


def lock_inputs(db: Session, project_id: UUID, data: RenderCreate) -> dict:
    project = require_record(db, Project, project_id)
    episode = require_record(db, Episode, data.episode_id)
    if episode.project_id != project_id:
        raise HTTPException(status_code=404, detail="剧集不属于此项目")
    shots = db.execute(
        select(Shot, Scene)
        .join(Scene)
        .where(Scene.episode_id == episode.id)
        .order_by(Scene.number, Shot.number)
    ).all()
    if not shots or len(shots) > 100:
        raise HTTPException(status_code=422, detail="每次样片需要 1–100 个分镜")
    if sum(shot.duration_seconds for shot, _scene in shots) > 300:
        raise HTTPException(status_code=422, detail="本地样片最多 300 秒，请拆分剧集")
    locked = []
    checked = set()
    for shot, scene in shots:
        binding = db.get(ShotMedia, shot.id)
        if not binding or not binding.image_asset_id:
            raise HTTPException(
                status_code=422,
                detail=f"场景 {scene.number} 分镜 {shot.number} 缺少图片，请先绑定素材",
            )
        media = {}
        for field, kind in [("image_asset_id", "image"), ("audio_asset_id", "audio")]:
            asset_id = getattr(binding, field)
            if asset_id is None:
                media[kind] = None
                continue
            asset = project_asset(db, project_id, asset_id, kind)
            path = media_path(asset.storage_key)
            if asset.id not in checked and (
                not path.is_file() or digest_file(path) != asset.sha256
            ):
                raise HTTPException(
                    status_code=422, detail=f"素材「{asset.filename}」缺失或已变化，请重新上传"
                )
            checked.add(asset.id)
            if kind == "audio" and asset.duration_ms > shot.duration_seconds * 1000:
                raise HTTPException(
                    status_code=422,
                    detail=f"分镜「{shot.title}」配音长于镜头，请延长镜头或更换配音；不会自动截断",
                )
            media[kind] = {
                key: getattr(asset, key)
                for key in ["storage_key", "filename", "sha256", "source_note", "duration_ms"]
            }
            media[kind]["asset_id"] = str(asset.id)
        locked.append(
            {
                "shot_id": str(shot.id),
                "revision": shot.revision,
                "binding_revision": binding.revision,
                "scene_number": scene.number,
                "shot_number": shot.number,
                "title": shot.title,
                "dialogue": shot.dialogue,
                "duration_seconds": shot.duration_seconds,
                **media,
            }
        )
    width, height = (1280, 720) if data.orientation == "landscape" else (720, 1280)
    return {
        "pipeline_version": "local-storyboard@1",
        "project_id": str(project_id),
        "production_type": project.production_type,
        "profile_id": project.profile_id,
        "episode_id": str(episode.id),
        "episode_number": episode.number,
        "episode_title": episode.title,
        "width": width,
        "height": height,
        "fps": 24,
        "shots": locked,
    }


def create_render(db: Session, project_id: UUID, data: RenderCreate) -> RenderJob:
    request = {"project_id": str(project_id), **data.model_dump(mode="json")}
    fingerprint = hashlib.sha256(json.dumps(request, sort_keys=True).encode()).hexdigest()

    def check_previous(job):
        if job.request_fingerprint != fingerprint:
            raise HTTPException(status_code=409, detail="任务请求标识已被其他内容使用")
        return job

    previous = db.scalar(select(RenderJob).where(RenderJob.request_id == data.request_id))
    if previous:
        return check_previous(previous)
    require_tools()
    snapshot = lock_inputs(db, project_id, data)
    job = RenderJob(
        project_id=project_id,
        episode_id=data.episode_id,
        request_id=data.request_id,
        request_fingerprint=fingerprint,
        input_snapshot=snapshot,
        total_shots=len(snapshot["shots"]),
        duration_ms=sum(s["duration_seconds"] for s in snapshot["shots"]) * 1000,
        width=snapshot["width"],
        height=snapshot["height"],
    )
    db.add(job)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        previous = db.scalar(select(RenderJob).where(RenderJob.request_id == data.request_id))
        if previous:
            return check_previous(previous)
        raise HTTPException(status_code=409, detail="渲染任务创建冲突，请刷新重试") from exc
    db.refresh(job)
    return job
