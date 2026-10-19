from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from studio.core.database import get_session
from studio.modules.catalog import service
from studio.modules.catalog.models import Episode, Project, Scene, Shot
from studio.modules.catalog.schemas import (
    EpisodeCreate,
    EpisodeRead,
    OverviewRead,
    ProjectCreate,
    ProjectPageRead,
    ProjectRead,
    SceneCreate,
    SceneRead,
    ShotCreate,
    ShotRead,
    ShotUpdate,
)
from studio.modules.production.profiles import PROFILES, ProductionProfile

router = APIRouter(prefix="/api/v1", tags=["catalog"])
DB = Annotated[Session, Depends(get_session)]


@router.get("/overview", response_model=OverviewRead)
def overview(db: DB):
    return {
        key: db.scalar(select(func.count()).select_from(model)) or 0
        for key, model in (
            ("projects", Project),
            ("episodes", Episode),
            ("scenes", Scene),
            ("shots", Shot),
        )
    }


@router.get("/production-profiles", response_model=list[ProductionProfile])
def list_profiles():
    return PROFILES


@router.get("/projects", response_model=ProjectPageRead)
def list_projects(
    db: DB,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 12,
    q: Annotated[str, Query(max_length=120)] = "",
):
    statement = select(Project)
    if q.strip():
        statement = statement.where(Project.name.icontains(q.strip(), autoescape=True))
    total = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    items = db.scalars(
        statement.order_by(Project.created_at.desc(), Project.id).offset(offset).limit(limit)
    ).all()
    return {"items": items, "total": total, "offset": offset, "limit": limit}


@router.post("/projects", response_model=ProjectRead, status_code=201)
def create_project(data: ProjectCreate, db: DB):
    return service.create_project(db, data)


@router.get("/projects/{project_id}", response_model=ProjectRead)
def get_project(project_id: UUID, db: DB):
    return service.require_record(db, Project, project_id)


@router.get("/projects/{project_id}/episodes", response_model=list[EpisodeRead])
def list_episodes(project_id: UUID, db: DB):
    service.require_record(db, Project, project_id)
    return db.scalars(
        select(Episode).where(Episode.project_id == project_id).order_by(Episode.number)
    ).all()


@router.post("/projects/{project_id}/episodes", response_model=EpisodeRead, status_code=201)
def create_episode(project_id: UUID, data: EpisodeCreate, db: DB):
    service.require_record(db, Project, project_id)
    return service.save_record(db, Episode(project_id=project_id, **data.model_dump()))


@router.get("/episodes/{episode_id}/scenes", response_model=list[SceneRead])
def list_scenes(episode_id: UUID, db: DB):
    service.require_record(db, Episode, episode_id)
    return db.scalars(
        select(Scene).where(Scene.episode_id == episode_id).order_by(Scene.number)
    ).all()


@router.post("/episodes/{episode_id}/scenes", response_model=SceneRead, status_code=201)
def create_scene(episode_id: UUID, data: SceneCreate, db: DB):
    service.require_record(db, Episode, episode_id)
    return service.save_record(db, Scene(episode_id=episode_id, **data.model_dump()))


@router.get("/scenes/{scene_id}/shots", response_model=list[ShotRead])
def list_shots(scene_id: UUID, db: DB):
    service.require_record(db, Scene, scene_id)
    return db.scalars(select(Shot).where(Shot.scene_id == scene_id).order_by(Shot.number)).all()


@router.post("/scenes/{scene_id}/shots", response_model=ShotRead, status_code=201)
def create_shot(scene_id: UUID, data: ShotCreate, db: DB):
    service.require_record(db, Scene, scene_id)
    return service.save_record(db, Shot(scene_id=scene_id, **data.model_dump()))


@router.put("/shots/{shot_id}", response_model=ShotRead)
def update_shot(shot_id: UUID, data: ShotUpdate, db: DB):
    return service.update_shot(db, shot_id, data)
