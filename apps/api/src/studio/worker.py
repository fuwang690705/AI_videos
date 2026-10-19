import asyncio
import logging

from temporalio.client import Client
from temporalio.worker import Worker

from studio.core.config import get_settings
from studio.workflows.preflight import ProductionPreflightWorkflow, validate_snapshot


async def main() -> None:
    settings = get_settings()
    client = await Client.connect(settings.temporal_address, namespace=settings.temporal_namespace)
    logging.info("Worker listening on queue %s", settings.temporal_task_queue)
    async with Worker(
        client,
        task_queue=settings.temporal_task_queue,
        workflows=[ProductionPreflightWorkflow],
        activities=[validate_snapshot],
    ):
        await asyncio.Event().wait()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
