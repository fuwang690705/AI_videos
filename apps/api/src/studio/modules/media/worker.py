"""One local rendering worker. Queue state and immutable inputs live in the database."""

import html
import json
import logging
import shutil
import signal
import subprocess
import tempfile
import threading
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import Engine, select, update
from sqlalchemy.orm import sessionmaker

from studio.core.config import get_settings
from studio.core.database import build_engine
from studio.modules.media.files import digest_file, media_path, probe
from studio.modules.media.models import RenderJob

log = logging.getLogger(__name__)


class RenderStopped(Exception):
    pass


def timestamp(milliseconds: int, separator: str) -> str:
    seconds, ms = divmod(milliseconds, 1000)
    minutes, second = divmod(seconds, 60)
    hour, minute = divmod(minutes, 60)
    return f"{hour:02}:{minute:02}:{second:02}{separator}{ms:03}"


def write_subtitles(shots: list[dict], folder: Path):
    srt, vtt, position, index = [], ["WEBVTT\n"], 0, 0
    for shot in shots:
        end = position + shot["duration_seconds"] * 1000
        text = "\n".join(
            line
            for line in shot["dialogue"].replace("\x00", "").replace("\r", "").splitlines()
            if line.strip()
        )
        if text:
            index += 1
            escaped = html.escape(text)
            srt.append(
                f"{index}\n{timestamp(position, ',')} --> {timestamp(end, ',')}\n{escaped}\n"
            )
            vtt.append(f"{timestamp(position, '.')} --> {timestamp(end, '.')}\n{escaped}\n")
        position = end
    (folder / "subtitles.srt").write_text("\n".join(srt), encoding="utf-8")
    (folder / "subtitles.vtt").write_text("\n".join(vtt) + "\n", encoding="utf-8")


class MediaWorker:
    def __init__(self, engine: Engine, stop: threading.Event | None = None):
        self.sessions = sessionmaker(bind=engine, expire_on_commit=False)
        self.stop = stop or threading.Event()

    def recover_expired(self):
        with self.sessions() as db:
            expired = db.execute(
                update(RenderJob)
                .where(
                    RenderJob.status == "running",
                    RenderJob.heartbeat_at < datetime.now(UTC) - timedelta(seconds=45),
                )
                .values(
                    status="failed",
                    error="渲染中断或 Worker 失去连接，请重新提交；原素材保留",
                    finished_at=datetime.now(UTC),
                )
                .returning(RenderJob.id, RenderJob.worker_token)
            ).all()
            db.commit()
        for job_id, token in expired:
            shutil.rmtree(media_path(f"render-work/{job_id}-{token}"), ignore_errors=True)
            shutil.rmtree(media_path(f"renders/{job_id}"), ignore_errors=True)

    def claim(self) -> tuple[UUID, UUID, dict] | None:
        self.recover_expired()
        with self.sessions() as db:
            job = db.scalar(
                select(RenderJob)
                .where(RenderJob.status == "queued")
                .order_by(RenderJob.created_at, RenderJob.id)
                .limit(1)
            )
            if job is None:
                return None
            token = uuid4()
            result = db.execute(
                update(RenderJob)
                .where(RenderJob.id == job.id, RenderJob.status == "queued")
                .values(status="running", worker_token=token, heartbeat_at=datetime.now(UTC))
                .execution_options(synchronize_session=False)
            )
            db.commit()
            if result.rowcount == 0:
                return None
            return job.id, token, job.input_snapshot

    def touch(self, job_id: UUID, token: UUID, **values):
        with self.sessions() as db:
            result = db.execute(
                update(RenderJob)
                .where(
                    RenderJob.id == job_id,
                    RenderJob.status == "running",
                    RenderJob.worker_token == token,
                )
                .values(heartbeat_at=datetime.now(UTC), **values)
            )
            db.commit()
            if result.rowcount != 1:
                raise RenderStopped("渲染任务状态已变化，停止本次处理")

    def command(self, args: list[str], job_id: UUID, token: UUID, cwd: Path, timeout: int = 240):
        with tempfile.TemporaryFile() as error_log:
            process = subprocess.Popen(
                [
                    get_settings().ffmpeg_path,
                    "-nostdin",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    *args,
                ],
                cwd=cwd,
                stdout=subprocess.DEVNULL,
                stderr=error_log,
            )
            deadline, heartbeat = time.monotonic() + timeout, 0.0
            try:
                while process.poll() is None:
                    if self.stop.is_set():
                        raise RenderStopped("本地服务已停止，本次样片未完成；可重新提交")
                    if time.monotonic() > deadline:
                        raise RenderStopped("渲染超时，请减少镜头数量或缩短时长后重试")
                    if time.monotonic() >= heartbeat:
                        self.touch(job_id, token)
                        heartbeat = time.monotonic() + 5
                    self.stop.wait(0.2)
                if process.returncode:
                    raise RenderStopped(
                        "FFmpeg 渲染失败，请检查源素材或本机编码器；未提供不完整样片"
                    )
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()

    def run_once(self) -> bool:
        claimed = self.claim()
        if claimed is None:
            return False
        job_id, token, snapshot = claimed
        work = media_path(f"render-work/{job_id}-{token}")
        destination = media_path(f"renders/{job_id}")
        started = time.monotonic()
        try:
            work.mkdir(parents=True, exist_ok=False)
            checked = set()
            segments = []
            width, height = snapshot["width"], snapshot["height"]
            for index, shot in enumerate(snapshot["shots"]):
                if time.monotonic() - started > 900:
                    raise RenderStopped("样片渲染总耗时超过 15 分钟，请拆分后重试")
                for kind in ["image", "audio"]:
                    asset = shot[kind]
                    if asset and asset["storage_key"] not in checked:
                        path = media_path(asset["storage_key"])
                        if not path.is_file() or digest_file(path) != asset["sha256"]:
                            raise RenderStopped("输入素材缺失或已变化，请重新上传并提交新任务")
                        checked.add(asset["storage_key"])
                duration = shot["duration_seconds"]
                args = [
                    "-protocol_whitelist",
                    "file,pipe",
                    "-loop",
                    "1",
                    "-framerate",
                    "24",
                    "-i",
                    str(media_path(shot["image"]["storage_key"])),
                ]
                if shot["audio"]:
                    args += [
                        "-protocol_whitelist",
                        "file,pipe",
                        "-i",
                        str(media_path(shot["audio"]["storage_key"])),
                    ]
                else:
                    args += [
                        "-f",
                        "lavfi",
                        "-i",
                        "anullsrc=channel_layout=stereo:sample_rate=48000",
                    ]
                filters = (
                    f"[0:v]scale={width}:{height}:force_original_aspect_ratio=decrease,"
                    f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=0xf8f9f6,"
                    "setsar=1,fps=24,format=yuv420p[v];"
                    f"[1:a]aresample=48000,apad,atrim=0:{duration},asetpts=PTS-STARTPTS[a]"
                )
                filename = f"segment-{index:04}.mp4"
                args += [
                    "-filter_complex_threads",
                    "1",
                    "-filter_complex",
                    filters,
                    "-map",
                    "[v]",
                    "-map",
                    "[a]",
                    "-t",
                    str(duration),
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    "23",
                    "-threads",
                    "2",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "128k",
                    "-ac",
                    "2",
                    "-movflags",
                    "+faststart",
                    "-fs",
                    "536870912",
                    filename,
                ]
                self.command(
                    args,
                    job_id,
                    token,
                    work,
                    timeout=min(240, max(1, 900 - (time.monotonic() - started))),
                )
                segments.append(f"file '{filename}'\nduration {duration}")
                self.touch(job_id, token, completed_shots=index + 1)
            (work / "segments.txt").write_text("\n".join(segments), encoding="utf-8")
            expected = sum(s["duration_seconds"] for s in snapshot["shots"])
            self.command(
                [
                    "-f",
                    "concat",
                    "-safe",
                    "1",
                    "-i",
                    "segments.txt",
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "128k",
                    "-ac",
                    "2",
                    "-ar",
                    "48000",
                    "-af",
                    f"aresample=async=1:first_pts=0,apad,atrim=0:{expected}",
                    "-t",
                    str(expected),
                    "-fs",
                    "536870912",
                    "-movflags",
                    "+faststart",
                    "video.mp4",
                ],
                job_id,
                token,
                work,
                timeout=min(60, max(1, 900 - (time.monotonic() - started))),
            )
            output = probe(work / "video.mp4")
            video = next(s for s in output["streams"] if s["codec_type"] == "video")
            audio = next(s for s in output["streams"] if s["codec_type"] == "audio")
            if (
                video["codec_name"] != "h264"
                or audio["codec_name"] != "aac"
                or video["width"] != width
                or video["height"] != height
                or abs(float(output["format"]["duration"]) - expected) > 0.15
            ):
                raise RenderStopped("输出规格校验未通过，请重新渲染")
            write_subtitles(snapshot["shots"], work)
            checksum = digest_file(work / "video.mp4")
            # Preserve the exact inputs and basic output checks with every deliverable.
            manifest = {
                **snapshot,
                "output_sha256": checksum,
                "output_duration_seconds": output["format"]["duration"],
                "subtitle_timing": "one-dialogue-cue-per-shot",
                "ai_generation_used": False,
            }
            manifest["ffmpeg_version"] = (
                subprocess.run(
                    [get_settings().ffmpeg_path, "-version"],
                    capture_output=True,
                    timeout=5,
                    check=True,
                )
                .stdout.decode(errors="replace")
                .splitlines()[0]
            )
            (work / "manifest.json").write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            self.touch(job_id, token)
            for segment in work.glob("segment-*.mp4"):
                segment.unlink()
            (work / "segments.txt").unlink()
            destination.parent.mkdir(parents=True, exist_ok=True)
            work.rename(destination)
            self.touch(
                job_id,
                token,
                status="succeeded",
                output_sha256=checksum,
                finished_at=datetime.now(UTC),
            )
        except Exception as exc:
            message = (
                str(exc)
                if isinstance(exc, RenderStopped)
                else "本地渲染失败，请检查素材和 FFmpeg 安装后重新提交"
            )
            log.warning("Local render %s failed: %s", job_id, type(exc).__name__)
            with self.sessions() as db:
                db.execute(
                    update(RenderJob)
                    .where(
                        RenderJob.id == job_id,
                        RenderJob.status == "running",
                        RenderJob.worker_token == token,
                    )
                    .values(status="failed", error=message, finished_at=datetime.now(UTC))
                )
                db.commit()
            # A late/expired worker cannot expose its artifact as a completed job.
            shutil.rmtree(destination, ignore_errors=True)
        finally:
            shutil.rmtree(work, ignore_errors=True)
        return True


def main():
    logging.basicConfig(level=logging.INFO)
    stop = threading.Event()
    for name in (signal.SIGINT, signal.SIGTERM):
        signal.signal(name, lambda _sig, _frame: stop.set())
    engine = build_engine(get_settings().database_url)
    worker = MediaWorker(engine, stop)
    print("STUDIO_MEDIA_WORKER_READY", flush=True)
    try:
        while not stop.is_set():
            if not worker.run_once():
                stop.wait(0.5)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
