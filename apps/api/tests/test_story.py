from uuid import uuid4

import pytest

SCRIPT = """第2集：雨夜
简介：收到一封信
场景3：天台
地点：天台 · 夜
分镜4：信封特写
画面：镜头缓慢推近
  雨水沿信封滑落
动作：拿起信封
对白：你终于来了。
  角色：这行仍然是对白。
  分镜8：这一行也是对白。
时长：8
景别：CU
镜头运动：dolly-in
场景6：门口
分镜2：回头
画面：人物回头
时长：5
第4集：天亮
场景1：街头
分镜1：街景
画面：阳光照亮街道
时长：6"""


def project(client):
    return client.post(
        "/api/v1/projects",
        json={"name": "故事项目", "production_type": "MANGA", "profile_id": "manga-standard@1.0"},
    ).json()["id"]


def test_story_persistence_concurrency_and_snapshot_copy(client):
    pid = project(client)
    url = f"/api/v1/story/projects/{pid}"
    assert client.get(url).json()["revision"] == 0
    content = {
        "revision": 0,
        "source_text": SCRIPT,
        "outline": "大纲",
        "world_setting": "当代",
        "character_notes": "角色外观",
        "continuity_notes": "信件尚未拆开",
    }
    first = client.put(url, json=content)
    assert first.status_code == 200
    assert first.json()["revision"] == 1
    assert client.put(url, json=content).status_code == 409
    assert (
        client.put(url, json={**content, "revision": 1, "outline": "新大纲"}).json()["revision"]
        == 2
    )
    assert client.put(url, json={**content, "revision": 1}).status_code == 409
    assert client.get(url).json()["outline"] == "新大纲"
    assert client.post(url + "/preview", json={"revision": 1}).status_code == 409
    preview = client.post(url + "/preview", json={"revision": 2})
    assert preview.status_code == 200
    snapshot = preview.json()
    assert client.post(url + "/preview", json={"revision": 2}).json() == snapshot
    assert [ep["number"] for ep in snapshot["episodes"]] == [2, 4]
    assert [sc["number"] for sc in snapshot["episodes"][0]["scenes"]] == [3, 6]
    shot = snapshot["episodes"][0]["scenes"][0]["shots"][0]
    assert shot["number"] == 4
    assert shot["visual_description"] == "镜头缓慢推近\n雨水沿信封滑落"
    assert shot["dialogue"] == "你终于来了。\n角色：这行仍然是对白。\n分镜8：这一行也是对白。"
    assert shot["details"]["action_summary"] == "拿起信封"
    assert shot["duration_seconds"] == 8
    assert client.get(f"/api/v1/projects/{pid}/episodes").json() == []
    saved = client.post(
        "/api/v1/creation/imports",
        json={"request_id": str(uuid4()), "name": "剧本副本", "snapshot": snapshot},
    )
    assert saved.status_code == 201
    saved_story = client.get(f"/api/v1/story/projects/{saved.json()['id']}").json()
    assert saved_story["source_text"] == SCRIPT
    assert saved_story["outline"] == "新大纲"
    assert saved_story["continuity_notes"] == "信件尚未拆开"
    copied = client.get(f"/api/v1/creation/projects/{saved.json()['id']}/snapshot").json()
    assert copied["story"]["character_notes"] == "角色外观"


@pytest.mark.parametrize(
    "text",
    [
        "普通小说没有标记，应能保存，但不能假装自动拆解。",
        "场景1：错误层级\n分镜1：镜头",
        "第1集：错误\n分镜1：缺少场景",
        "第1集：标题\n场景1：地点\n分镜1：标题\n时长：2.5",
        "第1集：标题\n场景1：地点\n分镜1：标题\n时长：121",
        "第1集：标题\n场景1：地点\n分镜1：标题\n对白：a\n对白：b",
        "第1集：标题\n场景1：地点\n分镜1：标题\n画面：a\n未知：不可丢弃",
        "第1集：标题\n场景1：地点\n分镜1：甲\n分镜1：乙",
        "第1集：标题\n场景1：地点\n分镜1：" + "长" * 121,
        "第0集：标题\n场景1：地点\n分镜1：镜头",
    ],
)
def test_script_errors_do_not_create_or_change_catalog(client, text):
    pid = project(client)
    url = f"/api/v1/story/projects/{pid}"
    assert client.put(url, json={"revision": 0, "source_text": text}).status_code == 200
    before = client.get("/api/v1/overview").json()
    assert client.post(url + "/preview", json={"revision": 1}).status_code == 422
    assert client.get("/api/v1/overview").json() == before
    assert client.get(url).json()["source_text"] == text


def test_story_validation_and_empty_project(client):
    pid = project(client)
    url = f"/api/v1/story/projects/{pid}"
    assert client.put(url, json={"revision": 0, "source_text": "x" * 100001}).status_code == 422
    assert client.put(url, json={"revision": 0, "api_key": "rejected"}).status_code == 422
    assert client.get(url).json()["revision"] == 0
    assert client.get(f"/api/v1/story/projects/{uuid4()}").status_code == 404
    assert client.post(url + "/preview", json={"revision": 1}).status_code == 409
