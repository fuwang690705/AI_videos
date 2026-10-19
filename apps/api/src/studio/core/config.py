from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

API_ROOT = Path(__file__).resolve().parents[3]
REPO_ROOT = Path(__file__).resolve().parents[5]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="STUDIO_", env_file=REPO_ROOT / ".env", extra="ignore"
    )

    environment: Literal["local", "test"] = "local"
    database_url: str = f"sqlite:///{API_ROOT / '.data' / 'studio.db'}"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    temporal_address: str = "127.0.0.1:7233"
    temporal_namespace: str = "default"
    temporal_task_queue: str = "studio-production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
