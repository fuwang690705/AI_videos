from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from studio.core.config import get_settings
from studio.core.database import get_session
from studio.modules.catalog.router import router
from studio.modules.creation.router import router as creation_router
from studio.modules.media.router import router as media_router
from studio.modules.story.router import router as story_router


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="AI Content Studio API",
        version="0.1.0",
        description="内部制作平台基础接口；当前仅支持本地开发，尚未接入生成模型与身份认证。",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Content-Type"],
    )
    app.include_router(router)
    app.include_router(creation_router)
    app.include_router(story_router)
    app.include_router(media_router)

    @app.get("/health/live", tags=["health"])
    def live() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/ready", tags=["health"])
    def ready(db: Annotated[Session, Depends(get_session)]) -> dict[str, str]:
        try:
            revision = db.execute(text("SELECT version_num FROM alembic_version")).scalar()
            if revision != "0004_media":
                raise HTTPException(status_code=503, detail="数据库迁移版本不匹配")
            db.execute(text("SELECT id FROM projects LIMIT 1"))
        except SQLAlchemyError as exc:
            raise HTTPException(
                status_code=503, detail="数据库未就绪，请检查连接并运行迁移"
            ) from exc
        return {"status": "ready", "database": "connected"}

    return app


app = create_app()
