from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from studio.core.config import API_ROOT, get_settings
from studio.core.database import build_engine


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
