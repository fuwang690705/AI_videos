from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from studio.modules.catalog.models import Episode, Project, Scene, Shot
from studio.modules.catalog.service import require_record
from studio.modules.media.models import MediaAsset, ShotMedia
from studio.modules.media.schemas import BindingRead, BindingUpdate, MediaReference, MediaSnapshot


def project_shot(db: Session, project_id: UUID, shot_id: UUID) -> Shot:
    shot = db.scalar(
        select(Shot)
        .join(Scene)
        .join(Episode)
        .where(Shot.id == shot_id, Episode.project_id == project_id)
    )
    if shot is None:
        raise HTTPException(status_code=404, detail="分镜不存在或不属于此项目")
    return shot


def project_asset(
    db: Session, project_id: UUID, asset_id: UUID, kind: str | None = None
) -> MediaAsset:
    asset = db.get(MediaAsset, asset_id)
    if asset is None or asset.project_id != project_id:
        raise HTTPException(status_code=404, detail="素材不存在或不属于此项目")
    if kind and asset.kind != kind:
        raise HTTPException(status_code=422, detail="镜头图片与配音的素材类型不匹配")
    return asset


def list_bindings(db: Session, project_id: UUID) -> list[ShotMedia]:
    return list(
        db.scalars(
            select(ShotMedia)
            .join(Shot)
            .join(Scene)
            .join(Episode)
            .where(Episode.project_id == project_id)
        )
    )


def bind_shot(db: Session, project_id: UUID, shot_id: UUID, data: BindingUpdate) -> BindingRead:
    project_shot(db, project_id, shot_id)
    for asset_id, kind in [(data.image_asset_id, "image"), (data.audio_asset_id, "audio")]:
        if asset_id:
            project_asset(db, project_id, asset_id, kind)
    if data.revision == 0:
        db.add(ShotMedia(shot_id=shot_id, **data.model_dump(exclude={"revision"})))
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(status_code=409, detail="素材绑定已被修改，请刷新后重试") from exc
    else:
        result = db.execute(
            update(ShotMedia)
            .where(ShotMedia.shot_id == shot_id, ShotMedia.revision == data.revision)
            .values(**data.model_dump(exclude={"revision"}), revision=ShotMedia.revision + 1)
            .execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            db.rollback()
            raise HTTPException(status_code=409, detail="素材绑定已被修改，请刷新后重试")
        db.commit()
        db.expire_all()
    return BindingRead.model_validate(db.get(ShotMedia, shot_id))


def export_media(db: Session, project_id: UUID) -> MediaSnapshot | None:
    bindings = list_bindings(db, project_id)
    if not bindings:
        return None
    return MediaSnapshot(
        source_project_id=project_id,
        bindings=[
            MediaReference(
                shot_id=b.shot_id, image_asset_id=b.image_asset_id, audio_asset_id=b.audio_asset_id
            )
            for b in bindings
        ],
    )


def copy_media(db: Session, source: MediaSnapshot, project_id: UUID, shot_map: dict[UUID, UUID]):
    require_record(db, Project, source.source_project_id)
    copied: dict[UUID, UUID] = {}
    used_shots: set[UUID] = set()
    for binding in source.bindings:
        if binding.shot_id not in shot_map or binding.shot_id in used_shots:
            raise HTTPException(status_code=422, detail="素材引用包含未知或重复的分镜")
        used_shots.add(binding.shot_id)
        targets = {}
        for field, kind in [("image_asset_id", "image"), ("audio_asset_id", "audio")]:
            asset_id = getattr(binding, field)
            if asset_id is None:
                targets[field] = None
                continue
            asset = project_asset(db, source.source_project_id, asset_id, kind)
            if asset_id not in copied:
                # Immutable local files can be referenced by new project-owned metadata.
                clone = MediaAsset(
                    project_id=project_id,
                    **{
                        key: getattr(asset, key)
                        for key in [
                            "kind",
                            "filename",
                            "storage_key",
                            "sha256",
                            "source_sha256",
                            "byte_size",
                            "codec",
                            "width",
                            "height",
                            "duration_ms",
                            "source_note",
                        ]
                    },
                )
                db.add(clone)
                db.flush()
                copied[asset_id] = clone.id
            targets[field] = copied[asset_id]
        db.add(ShotMedia(shot_id=shot_map[binding.shot_id], **targets))
