from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from studio.core.config import API_ROOT, get_settings
from studio.core.database import build_engine
from studio.modules.catalog.models import Project


def test_migration_round_trip(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'migration.db'}"
    monkeypatch.setenv("STUDIO_DATABASE_URL", url)
    get_settings.cache_clear()

    config = Config(str(API_ROOT / "alembic.ini"))
    command.upgrade(config, "head")
    command.check(config)
    engine = build_engine(url)
    assert {"projects", "episodes", "scenes", "shots"} <= set(inspect(engine).get_table_names())
    engine.dispose()
    command.downgrade(config, "base")
    engine = build_engine(url)
    assert "projects" not in inspect(engine).get_table_names()
    engine.dispose()
    command.upgrade(config, "head")
    get_settings.cache_clear()


def test_creation_migration_preserves_existing_catalog(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'existing.db'}"
    monkeypatch.setenv("STUDIO_DATABASE_URL", url)
    get_settings.cache_clear()
    config = Config(str(API_ROOT / "alembic.ini"))
    command.upgrade(config, "0001_catalog")
    engine = build_engine(url)
    with Session(engine, expire_on_commit=False) as db:
        project = Project(
            name="原有项目",
            synopsis="保留原内容",
            production_type="MANGA",
            profile_id="manga-standard@1.0",
        )
        db.add(project)
        db.commit()
        project_id = project.id
    engine.dispose()
    command.upgrade(config, "head")
    engine = build_engine(url)
    with Session(engine) as db:
        saved = db.get(Project, project_id)
        assert saved.name == "原有项目"
        assert saved.synopsis == "保留原内容"
    assert "creation_imports" in inspect(engine).get_table_names()
    engine.dispose()
    get_settings.cache_clear()
