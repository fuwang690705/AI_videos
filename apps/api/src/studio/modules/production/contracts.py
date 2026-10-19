"""生产引擎扩展契约；当前不注册任何真实生成 Provider。"""

from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field


class ProviderState(StrEnum):
    SUBMITTED = "SUBMITTED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    UNKNOWN = "UNKNOWN"
    CANCELED = "CANCELED"


class GenerationRequest(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    request_id: str = Field(min_length=1)
    model_id: str = Field(min_length=1)
    prompt: str = Field(min_length=1)
    reference_asset_versions: tuple[str, ...] = ()
    duration_seconds: int = Field(ge=1, le=120)


@dataclass(frozen=True)
class CostEstimate:
    amount: Decimal
    currency: str
    price_version: str


@dataclass(frozen=True)
class ProviderJob:
    request_id: str
    provider_job_id: str | None
    state: ProviderState


class VideoProvider(Protocol):
    """适配器必须预检能力；未知结果不能直接再次提交。"""

    async def validate(self, request: GenerationRequest) -> None: ...
    async def estimate(self, request: GenerationRequest) -> CostEstimate: ...
    async def submit(self, request: GenerationRequest) -> ProviderJob: ...
    async def query(self, job: ProviderJob) -> ProviderJob: ...
    async def cancel(self, job: ProviderJob) -> ProviderJob: ...
