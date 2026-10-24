import os

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from studio.core.config import API_ROOT, get_settings
from studio.core.database import build_engine, get_session
from studio.main import create_app


@pytest.fixture(
    params=["sqlite", "postgres"] if os.getenv("STUDIO_TEST_POSTGRES_URL") else ["sqlite"]
)
def client(request, tmp_path, monkeypatch):
    database_url = (
        os.environ["STUDIO_TEST_POSTGRES_URL"]
        if request.param == "postgres"
        else f"sqlite:///{tmp_path / 'test.db'}"
    )
    monkeypatch.setenv("STUDIO_DATABASE_URL", database_url)
    monkeypatch.setenv("STUDIO_ENVIRONMENT", "test")
    monkeypatch.setenv("STUDIO_MEDIA_ROOT", str(tmp_path / "media"))
    get_settings.cache_clear()
    config = Config(str(API_ROOT / "alembic.ini"))
    command.upgrade(config, "head")
    engine = build_engine(database_url)
    if request.param == "postgres":
        # 使用专用测试数据库；每个用例清空该数据库中的内容目录。
        with engine.begin() as connection:
            connection.execute(text("TRUNCATE TABLE projects CASCADE"))

    def test_session():
        with Session(engine, expire_on_commit=False) as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_session] = test_session
    with TestClient(app) as test_client:
        yield test_client
    engine.dispose()
    get_settings.cache_clear()
