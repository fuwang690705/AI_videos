"""无模型调用的编排样例，用于验证 Temporal 连接和不可变输入传递。"""

from dataclasses import dataclass
from datetime import timedelta

from temporalio import activity, workflow

with workflow.unsafe.imports_passed_through():
    from temporalio.common import RetryPolicy

    from studio.modules.production.profiles import get_profile


@dataclass(frozen=True)
class PreflightInput:
    project_id: str
    profile_id: str
    production_type: str


@dataclass(frozen=True)
class PreflightResult:
    project_id: str
    profile_id: str
    validated: bool
    generation_enabled: bool


@activity.defn
async def validate_snapshot(snapshot: PreflightInput) -> PreflightResult:
    from uuid import UUID

    UUID(snapshot.project_id)
    profile = get_profile(snapshot.profile_id)
    if profile is None or profile.production_type != snapshot.production_type:
        raise ValueError("生产配置与输入快照不匹配")
    return PreflightResult(snapshot.project_id, profile.id, True, profile.generation_enabled)


@workflow.defn
class ProductionPreflightWorkflow:
    @workflow.run
    async def run(self, snapshot: PreflightInput) -> PreflightResult:
        return await workflow.execute_activity(
            validate_snapshot,
            snapshot,
            start_to_close_timeout=timedelta(seconds=20),
            retry_policy=RetryPolicy(maximum_attempts=3, non_retryable_error_types=["ValueError"]),
        )
