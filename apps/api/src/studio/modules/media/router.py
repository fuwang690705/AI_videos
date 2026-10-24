import hashlib
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from studio.core.database import get_session
from studio.modules.catalog.models import Project
from studio.modules.catalog.service import require_record
from studio.modules.media.files import (
    MAX_UPLOAD,
    capabilities,
    digest_file,
    file_signature,
    media_path,
    require_tools,
    validate_upload,
)
from studio.modules.media.models import MediaAsset, RenderJob, RenderReview
from studio.modules.media.rendering import create_render
from studio.modules.media.schemas import (
    AssetRead,
    BindingRead,
    BindingUpdate,
    MediaCapabilities,
    RenderCreate,
    RenderRead,
    ReviewCreate,
    ReviewRead,
)
from studio.modules.media.service import bind_shot, list_bindings, project_asset

router = APIRouter(prefix="/api/v1/media", tags=["media"])
DB = Annotated[Session, Depends(get_session)]


@router.get("/capabilities", response_model=MediaCapabilities)
def get_capabilities():
    return capabilities()


@router.get("/projects/{project_id}/assets", response_model=list[AssetRead])
def assets(project_id: UUID, db: DB):
    require_record(db, Project, project_id)
    return db.scalars(
        select(MediaAsset)
        .where(MediaAsset.project_id == project_id)
        .order_by(MediaAsset.created_at.desc(), MediaAsset.id)
    ).all()


@router.post(
    "/projects/{project_id}/assets",
    response_model=AssetRead,
    status_code=201,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
            },
        }
    },
)
async def upload_asset(
    project_id: UUID,
    request: Request,
    db: DB,
    kind: Literal["image", "audio"],
    name: Annotated[str, Query(min_length=1, max_length=200, pattern=r"^[^\x00-\x1f\x7f]+$")],
    source_note: Annotated[str, Query(max_length=1000)] = "",
):
    require_record(db, Project, project_id)
    db.rollback()
    await run_in_threadpool(require_tools)
    asset_id = uuid4()
    source = media_path(f"uploads/{asset_id}.part")
    source.parent.mkdir(parents=True, exist_ok=True)
    target: Path | None = None
    committed = False
    digest, size = hashlib.sha256(), 0
    try:
        with source.open("wb") as output:
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_UPLOAD:
                    raise HTTPException(status_code=413, detail="单个上传文件最多 8 MB")
                digest.update(chunk)
                output.write(chunk)
        extension = file_signature(source, kind)
        key = f"assets/{asset_id}.{'wav' if kind == 'audio' else extension}"
        target = media_path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        metadata = await run_in_threadpool(validate_upload, source, target, kind)
        asset = MediaAsset(
            id=asset_id,
            project_id=project_id,
            kind=kind,
            filename=name,
            storage_key=key,
            source_sha256=digest.hexdigest(),
            sha256=await run_in_threadpool(digest_file, target),
            byte_size=target.stat().st_size,
            source_note=source_note,
            **metadata,
        )
        db.add(asset)
        db.commit()
        committed = True
        db.refresh(asset)
        return asset
    except Exception:
        db.rollback()
        raise
    finally:
        source.unlink(missing_ok=True)
        if not committed and target is not None:
            target.unlink(missing_ok=True)


@router.get("/projects/{project_id}/assets/{asset_id}/file")
def asset_file(project_id: UUID, asset_id: UUID, db: DB):
    asset = project_asset(db, project_id, asset_id)
    path = media_path(asset.storage_key)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="素材文件缺失，请重新上传")
    return FileResponse(
        path,
        media_type={
            "png": "image/png",
            "mjpeg": "image/jpeg",
            "webp": "image/webp",
            "pcm_s16le": "audio/wav",
        }[asset.codec],
        headers={"X-Content-Type-Options": "nosniff"},
    )


@router.get("/projects/{project_id}/bindings", response_model=list[BindingRead])
def bindings(project_id: UUID, db: DB):
    require_record(db, Project, project_id)
    return list_bindings(db, project_id)


@router.put("/projects/{project_id}/shots/{shot_id}", response_model=BindingRead)
def save_binding(project_id: UUID, shot_id: UUID, data: BindingUpdate, db: DB):
    return bind_shot(db, project_id, shot_id, data)


@router.get("/projects/{project_id}/renders", response_model=list[RenderRead])
def renders(project_id: UUID, db: DB):
    require_record(db, Project, project_id)
    return db.scalars(
        select(RenderJob)
        .where(RenderJob.project_id == project_id)
        .order_by(RenderJob.created_at.desc(), RenderJob.id)
        .limit(50)
    ).all()


@router.post("/projects/{project_id}/renders", response_model=RenderRead, status_code=201)
def render(project_id: UUID, data: RenderCreate, db: DB):
    return create_render(db, project_id, data)


def project_job(db: Session, project_id: UUID, job_id: UUID) -> RenderJob:
    job = require_record(db, RenderJob, job_id)
    if job.project_id != project_id:
        raise HTTPException(status_code=404, detail="任务不属于此项目")
    return job


@router.get("/projects/{project_id}/renders/{job_id}/files/{artifact}")
def render_file(
    project_id: UUID, job_id: UUID, artifact: Literal["video", "srt", "vtt", "manifest"], db: DB
):
    job = project_job(db, project_id, job_id)
    if job.status != "succeeded":
        raise HTTPException(status_code=409, detail="样片尚未完成，无法读取交付文件")
    filename, mime = {
        "video": ("video.mp4", "video/mp4"),
        "srt": ("subtitles.srt", "application/x-subrip"),
        "vtt": ("subtitles.vtt", "text/vtt"),
        "manifest": ("manifest.json", "application/json"),
    }[artifact]
    path = media_path(f"renders/{job.id}/{filename}")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="交付文件缺失，请重新渲染")
    return FileResponse(
        path,
        media_type=mime,
        filename=f"episode-{job.input_snapshot['episode_number']}-{str(job.id)[:8]}{path.suffix}",
        content_disposition_type="inline" if artifact in {"video", "vtt"} else "attachment",
    )


@router.get("/projects/{project_id}/renders/{job_id}/reviews", response_model=list[ReviewRead])
def reviews(project_id: UUID, job_id: UUID, db: DB):
    project_job(db, project_id, job_id)
    return db.scalars(
        select(RenderReview)
        .where(RenderReview.job_id == job_id)
        .order_by(RenderReview.created_at, RenderReview.id)
    ).all()


@router.post(
    "/projects/{project_id}/renders/{job_id}/reviews", response_model=ReviewRead, status_code=201
)
def review(project_id: UUID, job_id: UUID, data: ReviewCreate, db: DB):
    job = project_job(db, project_id, job_id)
    if job.status != "succeeded":
        raise HTTPException(status_code=409, detail="请先等待样片完成，再进行人工确认")
    record = RenderReview(job_id=job_id, **data.model_dump())
    db.add(record)
    job.review_status = data.decision
    db.commit()
    db.refresh(record)
    return record
