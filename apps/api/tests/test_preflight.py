import asyncio
from uuid import uuid4

import pytest

from studio.workflows.preflight import PreflightInput, validate_snapshot


def test_preflight_validates_profile_without_enabling_generation():
    result = asyncio.run(
        validate_snapshot(PreflightInput(str(uuid4()), "manga-standard@1.0", "MANGA"))
    )
    assert result.validated is True
    assert result.generation_enabled is False


def test_preflight_rejects_mismatched_snapshot():
    with pytest.raises(ValueError, match="不匹配"):
        asyncio.run(
            validate_snapshot(PreflightInput(str(uuid4()), "manga-standard@1.0", "REALISTIC"))
        )
