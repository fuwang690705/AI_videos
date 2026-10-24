from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from studio.core.database import get_session
from studio.modules.catalog.schemas import ProjectRead
from studio.modules.creation.schemas import CreationImport, CreationSnapshot
from studio.modules.creation.service import export_snapshot, import_copy

router = APIRouter(prefix="/api/v1/creation", tags=["creation"])
DB = Annotated[Session, Depends(get_session)]


@router.get("/projects/{project_id}/snapshot", response_model=CreationSnapshot)
def snapshot(project_id: UUID, db: DB):
    try:
        return export_snapshot(db, project_id)
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail="项目超过创作模块的单次限制（100 集、1000 场景、5000 分镜、4 MB 文本）",
        ) from exc


@router.post("/imports", response_model=ProjectRead, status_code=201)
def save_copy(data: CreationImport, db: DB):
    return import_copy(db, data)
