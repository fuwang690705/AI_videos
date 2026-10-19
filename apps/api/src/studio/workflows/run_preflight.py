"""运行无外部副作用的预检流程：python -m studio.workflows.run_preflight PROJECT_ID。"""

import argparse
import asyncio
from uuid import UUID, uuid4

from temporalio.client import Client

from studio.core.config import get_settings
from studio.core.database import SessionFactory
from studio.modules.catalog.models import Project
from studio.workflows.preflight import PreflightInput, ProductionPreflightWorkflow


async def main(project_id: UUID) -> None:
    with SessionFactory() as session:
        project = session.get(Project, project_id)
        if project is None:
            raise SystemExit("项目不存在，请先在工作台创建项目。")
        snapshot = PreflightInput(str(project.id), project.profile_id, project.production_type)
    settings = get_settings()
    client = await Client.connect(settings.temporal_address, namespace=settings.temporal_namespace)
    result = await client.execute_workflow(
        ProductionPreflightWorkflow.run,
        snapshot,
        id=f"preflight-{project_id}-{uuid4()}",
        task_queue=settings.temporal_task_queue,
    )
    print(result)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="运行项目快照预检；不会生成媒体或调用计费模型。")
    parser.add_argument("project_id", type=UUID)
    asyncio.run(main(parser.parse_args().project_id))
