from uuid import uuid4


def create_project(client, **overrides):
    payload = {
        "name": "雾城来信",
        "production_type": "MANGA",
        "profile_id": "manga-standard@1.0",
        **overrides,
    }
    return client.post("/api/v1/projects", json=payload)


def test_catalog_chain_persists_and_counts(client):
    assert client.get("/health/ready").status_code == 200
    project = create_project(client)
    assert project.status_code == 201
    project_id = project.json()["id"]
    assert client.get(f"/api/v1/projects/{project_id}").json()["name"] == "雾城来信"
    episode = client.post(
        f"/api/v1/projects/{project_id}/episodes", json={"number": 1, "title": "来信"}
    )
    assert episode.status_code == 201
    scene = client.post(
        f"/api/v1/episodes/{episode.json()['id']}/scenes",
        json={"number": 1, "title": "天台", "location": "城市天台 · 夜"},
    )
    assert scene.status_code == 201
    scene_id = scene.json()["id"]
    shot = client.post(
        f"/api/v1/scenes/{scene_id}/shots",
        json={"number": 1, "title": "来信特写", "duration_seconds": 6},
    )
    assert shot.status_code == 201
    assert client.get(f"/api/v1/scenes/{scene_id}/shots").json()[0]["id"] == shot.json()["id"]
    assert client.get("/api/v1/overview").json() == {
        "projects": 1,
        "episodes": 1,
        "scenes": 1,
        "shots": 1,
    }


def test_profile_mismatch_and_unregistered_profile_are_rejected(client):
    assert create_project(client, production_type="REALISTIC").status_code == 422
    assert create_project(client, profile_id="unknown@1.0").status_code == 422
    assert client.get("/api/v1/overview").json()["projects"] == 0
    profiles = client.get("/api/v1/production-profiles").json()
    assert all(profile["generation_enabled"] is False for profile in profiles)


def test_orphan_parent_and_duplicate_numbers_are_rejected(client):
    assert (
        client.post(
            f"/api/v1/projects/{uuid4()}/episodes", json={"number": 1, "title": "孤立剧集"}
        ).status_code
        == 404
    )
    project_id = create_project(client).json()["id"]
    url = f"/api/v1/projects/{project_id}/episodes"
    assert client.post(url, json={"number": 1, "title": "第一集"}).status_code == 201
    assert client.post(url, json={"number": 1, "title": "重复"}).status_code == 409
    assert len(client.get(url).json()) == 1
    assert client.post(url, json={"number": 0, "title": "非法编号"}).status_code == 422


def test_stale_shot_edit_does_not_overwrite_new_revision(client):
    project_id = create_project(client).json()["id"]
    episode_id = client.post(
        f"/api/v1/projects/{project_id}/episodes", json={"number": 1, "title": "第一集"}
    ).json()["id"]
    scene_id = client.post(
        f"/api/v1/episodes/{episode_id}/scenes", json={"number": 1, "title": "场景"}
    ).json()["id"]
    shot_id = client.post(
        f"/api/v1/scenes/{scene_id}/shots", json={"number": 1, "title": "初稿"}
    ).json()["id"]
    url = f"/api/v1/shots/{shot_id}"
    content = {"title": "新版", "revision": 1, "duration_seconds": 8}
    updated = client.put(url, json=content)
    assert updated.status_code == 200
    assert updated.json()["revision"] == 2
    assert client.put(url, json={**content, "title": "过期编辑"}).status_code == 409
    saved = client.get(f"/api/v1/scenes/{scene_id}/shots").json()[0]
    assert saved["title"] == "新版"
    assert saved["revision"] == 2


def test_search_pagination_and_input_validation(client):
    create_project(client, name="100% 的故事")
    create_project(client, name="另一部剧")
    page = client.get("/api/v1/projects", params={"q": "%", "limit": 1}).json()
    assert page["total"] == 1
    assert page["items"][0]["name"] == "100% 的故事"
    assert client.get("/api/v1/projects?offset=-1").status_code == 422
    assert client.get("/api/v1/projects?limit=101").status_code == 422
    assert create_project(client, name="   ").status_code == 422
    assert create_project(client, unexpected="value").status_code == 422
    assert client.get("/api/v1/projects?offset=1&limit=1").json()["total"] == 2
