from copy import deepcopy
from uuid import uuid4

import pytest
from sqlalchemy import event
from sqlalchemy.exc import IntegrityError

from studio.modules.catalog.models import Shot


def snapshot_payload(production_type="MANGA", profile_id="manga-standard@1.0"):
    return {
        "schema_version": 1,
        "project": {
            "name": "创作原稿",
            "synopsis": "故事简介",
            "production_type": production_type,
            "profile_id": profile_id,
        },
        "episodes": [
            {
                "id": str(uuid4()),
                "number": 3,
                "title": "第三集",
                "synopsis": "剧集简介",
                "scenes": [
                    {
                        "id": str(uuid4()),
                        "number": 7,
                        "title": "雨夜",
                        "location": "城市天台",
                        "shots": [
                            {
                                "id": str(uuid4()),
                                "number": 4,
                                "title": "信封特写",
                                "visual_description": "画面描述",
                                "dialogue": "你终于来了",
                                "duration_seconds": 8,
                                "details": {
                                    "action_summary": "放下信封",
                                    "shot_size": "CU",
                                    "camera_movement": "dolly-in",
                                    "special_technique": "none",
                                },
                            }
                        ],
                    }
                ],
            }
        ],
    }


def import_payload(snapshot):
    return {"request_id": str(uuid4()), "name": "创作副本", "snapshot": snapshot}


@pytest.mark.parametrize("direction", ["MANGA", "MEME_ANIMATION", "REALISTIC"])
def test_copy_roundtrip_preserves_tree_and_editorial_fields(client, direction):
    # Read registered IDs so the test checks the production contract for each direction.
    profiles = client.get("/api/v1/production-profiles").json()
    profile = next(item["id"] for item in profiles if item["production_type"] == direction)
    source = snapshot_payload(direction, profile)
    first = client.post("/api/v1/creation/imports", json=import_payload(source))
    assert first.status_code == 201
    first_id = first.json()["id"]
    exported = client.get(f"/api/v1/creation/projects/{first_id}/snapshot").json()
    old_shot = exported["episodes"][0]["scenes"][0]["shots"][0]
    assert old_shot["details"] == source["episodes"][0]["scenes"][0]["shots"][0]["details"]
    assert exported["episodes"][0]["number"] == 3
    assert exported["episodes"][0]["scenes"][0]["number"] == 7
    assert old_shot["number"] == 4
    modified = deepcopy(exported)
    modified["episodes"][0]["scenes"][0]["shots"][0]["dialogue"] = "修改后的对白"
    payload = import_payload(modified)
    second = client.post("/api/v1/creation/imports", json=payload)
    assert second.status_code == 201
    assert second.json()["production_type"] == direction
    assert second.json()["profile_id"] == profile
    assert second.json()["id"] != first_id
    assert client.post("/api/v1/creation/imports", json=payload).json()["id"] == second.json()["id"]
    assert client.get("/api/v1/overview").json()["projects"] == 2
    payload["name"] = "同一标识不同内容"
    assert client.post("/api/v1/creation/imports", json=payload).status_code == 409
    original = client.get(f"/api/v1/creation/projects/{first_id}/snapshot").json()
    assert original == exported
    saved = client.get(f"/api/v1/creation/projects/{second.json()['id']}/snapshot").json()
    new_shot = saved["episodes"][0]["scenes"][0]["shots"][0]
    assert new_shot["id"] != old_shot["id"]
    assert new_shot["dialogue"] == "修改后的对白"
    assert new_shot["details"] == old_shot["details"]


@pytest.mark.parametrize(
    "invalid",
    ["fraction", "range", "duplicate", "id", "length", "profile", "version", "extra", "missing"],
)
def test_invalid_import_writes_nothing(client, invalid):
    snapshot = snapshot_payload()
    episode = snapshot["episodes"][0]
    shot = episode["scenes"][0]["shots"][0]
    if invalid == "fraction":
        shot["duration_seconds"] = 2.5
    elif invalid == "range":
        shot["duration_seconds"] = 121
    elif invalid == "duplicate":
        episode["scenes"].append(deepcopy(episode["scenes"][0]))
    elif invalid == "id":
        shot["id"] = episode["id"]
    elif invalid == "length":
        shot["title"] = "长" * 121
    elif invalid == "profile":
        snapshot["project"]["production_type"] = "REALISTIC"
    elif invalid == "version":
        snapshot["schema_version"] = 2
    elif invalid == "extra":
        shot["api_key"] = "must-not-be-accepted"
    elif invalid == "missing":
        del episode["scenes"]
    response = client.post("/api/v1/creation/imports", json=import_payload(snapshot))
    assert response.status_code == 422
    assert client.get("/api/v1/overview").json() == dict(projects=0, episodes=0, scenes=0, shots=0)


def test_database_failure_rolls_back_partial_copy(client):
    def fail_insert(*_args):
        raise IntegrityError("injected shot write failure", {}, Exception("test"))

    event.listen(Shot, "before_insert", fail_insert)
    payload = import_payload(snapshot_payload())
    try:
        assert client.post("/api/v1/creation/imports", json=payload).status_code == 409
    finally:
        event.remove(Shot, "before_insert", fail_insert)
    assert client.get("/api/v1/overview").json() == dict(projects=0, episodes=0, scenes=0, shots=0)
    assert client.post("/api/v1/creation/imports", json=payload).status_code == 201


def test_empty_project_and_missing_source(client):
    snapshot = snapshot_payload()
    snapshot["episodes"] = []
    response = client.post("/api/v1/creation/imports", json=import_payload(snapshot))
    assert response.status_code == 201
    assert (
        client.get(f"/api/v1/creation/projects/{response.json()['id']}/snapshot").json()["episodes"]
        == []
    )
    assert client.get(f"/api/v1/creation/projects/{uuid4()}/snapshot").status_code == 404
