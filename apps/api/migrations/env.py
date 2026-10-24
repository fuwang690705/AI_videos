from logging.config import fileConfig

from alembic import context

from studio.core.config import get_settings
from studio.core.database import Base, build_engine
from studio.modules.catalog import models  # noqa: F401
from studio.modules.creation import models as creation_models  # noqa: F401
from studio.modules.media import models as media_models  # noqa: F401
from studio.modules.story import models as story_models  # noqa: F401

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata

if context.is_offline_mode():
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = build_engine(get_settings().database_url)
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=connection.dialect.name == "sqlite",
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()
