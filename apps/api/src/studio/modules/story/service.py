from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from studio.modules.catalog.models import Project
from studio.modules.catalog.service import require_record
from studio.modules.story.models import StoryDraft
from studio.modules.story.schemas import StoryRead, StoryUpdate


def read_story(db: Session, project_id: UUID) -> StoryRead:
    require_record(db, Project, project_id)
    record = db.get(StoryDraft, project_id)
    return StoryRead(
        project_id=project_id,
        revision=record.revision if record else 0,
        updated_at=record.updated_at if record else None,
        **(record.content if record else {}),
    )


def update_story(db: Session, project_id: UUID, data: StoryUpdate) -> StoryRead:
    require_record(db, Project, project_id)
    content = data.model_dump(exclude={"revision"})
    if data.revision == 0:
        db.add(StoryDraft(project_id=project_id, content=content))
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status_code=409, detail="故事草稿已被修改，请重新加载后保存"
            ) from exc
    else:
        result = db.execute(
            update(StoryDraft)
            .where(StoryDraft.project_id == project_id, StoryDraft.revision == data.revision)
            .values(content=content, revision=StoryDraft.revision + 1, updated_at=datetime.now(UTC))
            .execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            db.rollback()
            raise HTTPException(status_code=409, detail="故事草稿已被修改，请重新加载后保存")
        db.commit()
        db.expire_all()
    return read_story(db, project_id)
