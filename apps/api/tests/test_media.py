import hashlib
import io
import math
import struct
import wave
import zlib
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy.orm import Session

from studio.core.config import get_settings
from studio.core.database import build_engine
from studio.modules.media.files import media_path, probe
from studio.modules.media.models import RenderJob
from studio.modules.media.worker import MediaWorker


def png():
    def chunk(kind, data):
        return (
            struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
        )

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 32, 24, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress((b"\0" + b"\x60\x50\xb8" * 32) * 24))
        + chunk(b"IEND", b"")
    )


def wav(seconds=0.4):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(8000)
        audio.writeframes(
            b"".join(
                struct.pack("<h", round(5000 * math.sin(n * math.tau * 440 / 8000)))
                for n in range(round(8000 * seconds))
            )
        )
    return buffer.getvalue()


def seed(client, direction="MANGA"):
    profiles = client.get("/api/v1/production-profiles").json()
    profile = next(p["id"] for p in profiles if p["production_type"] == direction)
    project = client.post(
        "/api/v1/projects",
        json={"name": "本地样片", "production_type": direction, "profile_id": profile},
    ).json()
    episode = client.post(
        f"/api/v1/projects/{project['id']}/episodes", json={"number": 2, "title": "试播"}
    ).json()
    scene = client.post(
        f"/api/v1/episodes/{episode['id']}/scenes", json={"number": 3, "title": "天台"}
    ).json()
    shot = client.post(
        f"/api/v1/scenes/{scene['id']}/shots",
        json={
            "number": 4,
            "title": "镜头",
            "dialogue": "中文对白 <原样>\n第二行",
            "duration_seconds": 1,
        },
    ).json()
    return project, episode, scene, shot


def upload(client, pid, kind="image", data=None):
    return client.post(
        f"/api/v1/media/projects/{pid}/assets",
        params={
            "kind": kind,
            "name": "测试.png" if kind == "image" else "测试.wav",
            "source_note": "程序生成的测试素材，非 AI 输出",
        },
        content=data if data is not None else (png() if kind == "image" else wav()),
    )


def worker():
    engine = build_engine(get_settings().database_url)
    return engine, MediaWorker(engine)


@pytest.mark.parametrize("direction", ["MANGA", "MEME_ANIMATION", "REALISTIC"])
def test_real_upload_binding_render_subtitles_review_and_immutable_inputs(
    client, tmp_path, direction
):
    project, episode, scene, shot = seed(client, direction)
    pid = project["id"]
    assert client.get("/api/v1/media/capabilities").json()["rendering_available"]
    image = upload(client, pid)
    audio = upload(client, pid, "audio")
    assert image.status_code == audio.status_code == 201
    image, audio = image.json(), audio.json()
    assert (image["width"], image["height"]) == (32, 24)
    assert audio["codec"] == "pcm_s16le"
    assert audio["duration_ms"] == 400
    base = f"/api/v1/media/projects/{pid}"
    assert (
        client.put(
            f"{base}/shots/{shot['id']}",
            json={"revision": 0, "image_asset_id": image["id"], "audio_asset_id": audio["id"]},
        ).status_code
        == 200
    )
    second = client.post(
        f"/api/v1/scenes/{scene['id']}/shots",
        json={"number": 9, "title": "第二镜", "dialogue": "第二个镜头", "duration_seconds": 1},
    ).json()
    assert (
        client.put(
            f"{base}/shots/{second['id']}", json={"revision": 0, "image_asset_id": image["id"]}
        ).status_code
        == 200
    )
    payload = {"request_id": str(uuid4()), "episode_id": episode["id"], "orientation": "portrait"}
    queued = client.post(f"{base}/renders", json=payload)
    assert queued.status_code == 201
    job_id = queued.json()["id"]
    assert client.post(f"{base}/renders", json=payload).json()["id"] == job_id
    assert (
        client.post(f"{base}/renders/{job_id}/reviews", json={"decision": "approved"}).status_code
        == 409
    )
    assert client.get(f"{base}/renders/{job_id}/files/video").status_code == 409
    # Later edits must not change the queued input snapshot.
    client.put(
        f"/api/v1/shots/{shot['id']}",
        json={
            "revision": 1,
            "title": "后续修改",
            "dialogue": "不得混入历史样片",
            "duration_seconds": 3,
        },
    )
    engine, renderer = worker()
    try:
        assert renderer.run_once()
    finally:
        engine.dispose()
    job = client.get(f"{base}/renders").json()[0]
    assert job["status"] == "succeeded", job
    assert (job["width"], job["height"], job["duration_ms"], job["completed_shots"]) == (
        720,
        1280,
        2000,
        2,
    )
    response = client.get(f"{base}/renders/{job_id}/files/video")
    assert response.status_code == 200
    output = tmp_path / "actual.mp4"
    output.write_bytes(response.content)
    info = probe(output)
    assert abs(float(info["format"]["duration"]) - 2) < 0.15
    assert {s["codec_name"] for s in info["streams"]} == {"h264", "aac"}
    assert hashlib.sha256(response.content).hexdigest() == job["output_sha256"]
    subtitle = client.get(f"{base}/renders/{job_id}/files/srt").text
    assert "00:00:00,000 --> 00:00:01,000" in subtitle
    assert "00:00:01,000 --> 00:00:02,000" in subtitle
    assert "中文对白 &lt;原样&gt;" in subtitle
    assert "不得混入" not in subtitle
    assert client.get(f"{base}/renders/{job_id}/files/vtt").text.startswith("WEBVTT")
    manifest = client.get(f"{base}/renders/{job_id}/files/manifest").json()
    assert manifest["shots"][0]["revision"] == 1
    assert manifest["shots"][0]["image"]["sha256"] == image["sha256"]
    assert manifest["ai_generation_used"] is False
    assert manifest["production_type"] == direction
    assert manifest["profile_id"] == project["profile_id"]
    assert (
        client.post(
            f"{base}/renders/{job_id}/reviews",
            json={"decision": "approved", "note": "样片人工检查"},
        ).status_code
        == 201
    )
    assert client.get(f"{base}/renders").json()[0]["review_status"] == "approved"
    assert (
        client.post(
            f"{base}/renders/{job_id}/reviews", json={"decision": "changes_requested"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"{base}/renders/{job_id}/reviews",
            json={"decision": "changes_requested", "note": "对白需调整"},
        ).status_code
        == 201
    )
    assert len(client.get(f"{base}/renders/{job_id}/reviews").json()) == 2
    assert client.get(f"{base}/renders").json()[0]["review_status"] == "changes_requested"
    assert list(media_path("render-work").glob("*")) == []


def test_invalid_uploads_and_project_binding_isolation(client):
    project, _ep, _sc, shot = seed(client)
    other, _, _, _ = seed(client)
    pid = project["id"]
    assert upload(client, pid, data=b"not an image").status_code == 422
    assert upload(client, pid, "audio", png()).status_code == 422
    assert upload(client, pid, data=b"\x89PNG\r\n\x1a\ncorrupted").status_code == 422
    assert upload(client, pid, data=b"x" * (8 * 1024 * 1024 + 1)).status_code == 413
    assert client.get(f"/api/v1/media/projects/{pid}/assets").json() == []
    assert list(media_path("uploads").glob("*")) == []
    image = upload(client, pid).json()
    base = f"/api/v1/media/projects/{pid}"
    assert (
        client.get(f"/api/v1/media/projects/{other['id']}/assets/{image['id']}/file").status_code
        == 404
    )
    assert (
        client.put(
            f"{base}/shots/{shot['id']}", json={"revision": 0, "audio_asset_id": image["id"]}
        ).status_code
        == 422
    )
    content = {"revision": 0, "image_asset_id": image["id"]}
    assert client.put(f"{base}/shots/{shot['id']}", json=content).status_code == 200
    assert client.put(f"{base}/shots/{shot['id']}", json=content).status_code == 409
    assert (
        client.put(
            f"/api/v1/media/projects/{other['id']}/shots/{shot['id']}", json=content
        ).status_code
        == 404
    )
    assert (
        client.put(f"{base}/shots/{shot['id']}", json={"revision": 1}).json()["image_asset_id"]
        is None
    )


def test_render_preflight_never_truncates_audio_or_creates_partial_job(client):
    project, episode, _scene, shot = seed(client)
    base = f"/api/v1/media/projects/{project['id']}"
    payload = {"request_id": str(uuid4()), "episode_id": episode["id"]}
    assert client.post(base + "/renders", json=payload).status_code == 422
    image, audio = (
        upload(client, project["id"]).json(),
        upload(client, project["id"], "audio", wav(1.2)).json(),
    )
    client.put(
        f"{base}/shots/{shot['id']}",
        json={"revision": 0, "image_asset_id": image["id"], "audio_asset_id": audio["id"]},
    )
    result = client.post(base + "/renders", json=payload)
    assert result.status_code == 422
    assert "不会自动截断" in result.json()["detail"]
    assert client.get(base + "/renders").json() == []


def test_creation_copy_retains_bound_assets_and_rejects_invalid_references_atomically(client):
    project, _episode, _scene, shot = seed(client)
    base = f"/api/v1/media/projects/{project['id']}"
    image = upload(client, project["id"]).json()
    client.put(f"{base}/shots/{shot['id']}", json={"revision": 0, "image_asset_id": image["id"]})
    snapshot = client.get(f"/api/v1/creation/projects/{project['id']}/snapshot").json()
    copy = client.post(
        "/api/v1/creation/imports",
        json={"request_id": str(uuid4()), "name": "含素材的副本", "snapshot": snapshot},
    )
    assert copy.status_code == 201
    pid = copy.json()["id"]
    assets = client.get(f"/api/v1/media/projects/{pid}/assets").json()
    assert len(assets) == 1 and assets[0]["id"] != image["id"]
    assert assets[0]["sha256"] == image["sha256"]
    assert (
        client.get(f"/api/v1/media/projects/{pid}/assets/{assets[0]['id']}/file").content == png()
    )
    binding = client.get(f"/api/v1/media/projects/{pid}/bindings").json()[0]
    assert binding["shot_id"] != shot["id"]
    assert binding["image_asset_id"] == assets[0]["id"]
    before = client.get("/api/v1/overview").json()
    snapshot["media"]["bindings"][0]["shot_id"] = str(uuid4())
    assert (
        client.post(
            "/api/v1/creation/imports",
            json={"request_id": str(uuid4()), "name": "无效引用", "snapshot": snapshot},
        ).status_code
        == 422
    )
    assert client.get("/api/v1/overview").json() == before


def test_worker_claim_expiration_and_failure_do_not_publish_partial_video(client):
    project, episode, _scene, shot = seed(client)
    base = f"/api/v1/media/projects/{project['id']}"
    image = upload(client, project["id"]).json()
    client.put(f"{base}/shots/{shot['id']}", json={"revision": 0, "image_asset_id": image["id"]})
    job = client.post(
        base + "/renders", json={"request_id": str(uuid4()), "episode_id": episode["id"]}
    ).json()
    engine, renderer = worker()
    try:
        claimed = renderer.claim()
        assert claimed is not None
        partial = media_path(f"render-work/{claimed[0]}-{claimed[1]}")
        partial.mkdir(parents=True)
        (partial / "partial.mp4").write_bytes(b"unfinished")
        assert renderer.claim() is None
        with Session(engine) as db:
            record = db.get(RenderJob, UUID(job["id"]))
            record.heartbeat_at = datetime.now(UTC) - timedelta(seconds=60)
            db.commit()
        renderer.recover_expired()
        assert not partial.exists()
        assert client.get(base + "/renders").json()[0]["status"] == "failed"
        assert client.get(f"{base}/renders/{job['id']}/files/video").status_code == 409
        client.post(
            base + "/renders", json={"request_id": str(uuid4()), "episode_id": episode["id"]}
        )
        with Session(engine) as db:
            newest = db.query(RenderJob).filter_by(status="queued").one()
            key = newest.input_snapshot["shots"][0]["image"]["storage_key"]
        media_path(key).write_bytes(b"corrupted after queueing")
        assert renderer.run_once()
        assert client.get(base + "/renders").json()[0]["status"] == "failed"
        assert not list(media_path("render-work").glob("*"))
    finally:
        engine.dispose()


def test_missing_ffmpeg_is_reported_without_enabling_ai_generation(client, monkeypatch):
    monkeypatch.setenv("STUDIO_FFMPEG_PATH", "/nonexistent/studio-ffmpeg")
    get_settings.cache_clear()
    assert not client.get("/api/v1/media/capabilities").json()["rendering_available"]
    assert all(
        not p["generation_enabled"] for p in client.get("/api/v1/production-profiles").json()
    )


def test_many_shots_do_not_accumulate_audio_padding_into_timeline(client):
    project, episode, scene, shot = seed(client)
    base = f"/api/v1/media/projects/{project['id']}"
    image = upload(client, project["id"]).json()
    shots = [shot]
    for n in range(5, 12):
        shots.append(
            client.post(
                f"/api/v1/scenes/{scene['id']}/shots",
                json={"number": n, "title": "短镜头", "duration_seconds": 1},
            ).json()
        )
    for item in shots:
        assert (
            client.put(
                f"{base}/shots/{item['id']}", json={"revision": 0, "image_asset_id": image["id"]}
            ).status_code
            == 200
        )
    job = client.post(
        base + "/renders", json={"request_id": str(uuid4()), "episode_id": episode["id"]}
    ).json()
    engine, renderer = worker()
    try:
        assert renderer.run_once()
    finally:
        engine.dispose()
    assert client.get(base + "/renders").json()[0]["status"] == "succeeded"
    manifest = client.get(f"{base}/renders/{job['id']}/files/manifest").json()
    assert abs(float(manifest["output_duration_seconds"]) - 8) < 0.15
