from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from studio.modules.catalog.models import Project, Shot
from studio.modules.catalog.schemas import ProjectCreate, ShotUpdate
from studio.modules.production.profiles import get_profile


def require_record(session: Session, model, record_id: UUID):
    record = session.get(model, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="记录不存在")
    return record


def save_record(session: Session, record):
    session.add(record)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=409, detail="编号已存在或关联记录已变更，请刷新后重试"
        ) from exc
    session.refresh(record)
    return record


def create_project(session: Session, data: ProjectCreate) -> Project:
    profile = get_profile(data.profile_id)
    if profile is None or profile.production_type != data.production_type:
        raise HTTPException(status_code=422, detail="生产配置不存在或与内容方向不匹配")
    return save_record(session, Project(**data.model_dump()))


def update_shot(session: Session, shot_id: UUID, data: ShotUpdate) -> Shot:
    require_record(session, Shot, shot_id)
    values = data.model_dump(exclude={"revision"})
    result = session.execute(
        update(Shot)
        .where(Shot.id == shot_id, Shot.revision == data.revision)
        .values(**values, revision=Shot.revision + 1)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        session.rollback()
        raise HTTPException(status_code=409, detail="分镜已被修改，请刷新后再保存")
    session.commit()
    session.expire_all()
    return require_record(session, Shot, shot_id)
