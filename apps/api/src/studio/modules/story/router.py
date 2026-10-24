from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from studio.core.database import get_session
from studio.modules.catalog.models import Project
from studio.modules.catalog.service import require_record
from studio.modules.creation.schemas import CreationSnapshot
from studio.modules.story.parser import parse_script
from studio.modules.story.schemas import ScriptPreviewRequest, StoryContent, StoryRead, StoryUpdate
from studio.modules.story.service import read_story, update_story

router = APIRouter(prefix="/api/v1/story/projects", tags=["story"])
DB = Annotated[Session, Depends(get_session)]


@router.get("/{project_id}", response_model=StoryRead)
def get_draft(project_id: UUID, db: DB):
    return read_story(db, project_id)


@router.put("/{project_id}", response_model=StoryRead)
def save_draft(project_id: UUID, data: StoryUpdate, db: DB):
    return update_story(db, project_id, data)


@router.post("/{project_id}/preview", response_model=CreationSnapshot)
def preview(project_id: UUID, data: ScriptPreviewRequest, db: DB):
    project = require_record(db, Project, project_id)
    saved = read_story(db, project_id)
    if saved.revision != data.revision:
        raise HTTPException(status_code=409, detail="故事草稿版本已变化，请重新加载后预览")
    return parse_script(
        project,
        StoryContent.model_validate(
            saved.model_dump(exclude={"project_id", "revision", "updated_at"})
        ),
    )
