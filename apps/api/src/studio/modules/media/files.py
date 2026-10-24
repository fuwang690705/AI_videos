import hashlib
import json
import shutil
import subprocess
from pathlib import Path

from fastapi import HTTPException

from studio.core.config import get_settings
from studio.modules.media.schemas import MediaCapabilities

MAX_UPLOAD = 8 * 1024 * 1024


def media_path(key: str) -> Path:
    root = get_settings().media_root.resolve()
    path = (root / key).resolve()
    if not path.is_relative_to(root):
        raise ValueError("Invalid media storage key")
    return path


def digest_file(path: Path) -> str:
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def capabilities() -> MediaCapabilities:
    settings = get_settings()
    if not shutil.which(settings.ffmpeg_path) or not shutil.which(settings.ffprobe_path):
        return MediaCapabilities(
            rendering_available=False,
            detail="请安装 FFmpeg 和 ffprobe，加入 PATH 后重启本地服务；文本创作仍可使用",
        )
    try:
        encoders = subprocess.run(
            [settings.ffmpeg_path, "-hide_banner", "-encoders"],
            capture_output=True,
            timeout=5,
            check=True,
        ).stdout.decode(errors="replace")
        ready = "libx264" in encoders and " aac " in encoders
    except (OSError, subprocess.SubprocessError):
        ready = False
    return MediaCapabilities(
        rendering_available=ready,
        detail="本机分镜样片渲染可用"
        if ready
        else "FFmpeg 不支持 H.264/AAC 或无法启动，请检查安装",
    )


def require_tools():
    result = capabilities()
    if not result.rendering_available:
        raise HTTPException(status_code=503, detail=result.detail)


def probe(path: Path) -> dict:
    try:
        result = subprocess.run(
            [
                get_settings().ffprobe_path,
                "-v",
                "error",
                "-protocol_whitelist",
                "file,pipe",
                "-show_streams",
                "-show_format",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            timeout=15,
            check=True,
        )
        return json.loads(result.stdout)
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        raise HTTPException(status_code=422, detail="文件无法解析，请上传有效的图片或音频") from exc


def file_signature(path: Path, kind: str) -> str:
    with path.open("rb") as source:
        header = source.read(16)
    if kind == "image":
        if header.startswith(b"\x89PNG\r\n\x1a\n"):
            return "png"
        if header.startswith(b"\xff\xd8\xff"):
            return "jpg"
        if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
            return "webp"
    else:
        if header.startswith(b"RIFF") and header[8:12] == b"WAVE":
            return "wav"
        if header.startswith(b"ID3") or (
            len(header) >= 2 and header[0] == 255 and header[1] & 224 == 224
        ):
            return "mp3"
    raise HTTPException(
        status_code=422, detail="支持 PNG/JPEG/WebP 图片及 WAV/MP3 音频；文件内容须与类型匹配"
    )


def validate_upload(source: Path, target: Path, kind: str) -> dict:
    info = probe(source)
    settings = get_settings()
    if kind == "image":
        streams = [s for s in info.get("streams", []) if s.get("codec_type") == "video"]
        if len(streams) != 1 or streams[0].get("codec_name") not in {"png", "mjpeg", "webp"}:
            raise HTTPException(status_code=422, detail="请选择静态 PNG/JPEG/WebP 图片")
        stream = streams[0]
        width, height = stream.get("width", 0), stream.get("height", 0)
        if not (1 <= width <= 8192 and 1 <= height <= 8192 and width * height <= 25_000_000):
            raise HTTPException(status_code=422, detail="图片边长最多 8192，且总像素最多 2500 万")
        command = [
            settings.ffmpeg_path,
            "-nostdin",
            "-v",
            "error",
            "-xerror",
            "-protocol_whitelist",
            "file,pipe",
            "-i",
            str(source),
            "-frames:v",
            "1",
            "-threads",
            "2",
            "-f",
            "null",
            "-",
        ]
        try:
            subprocess.run(command, capture_output=True, timeout=20, check=True)
        except (OSError, subprocess.SubprocessError) as exc:
            raise HTTPException(status_code=422, detail="图片解码失败，未保存此素材") from exc
        source.replace(target)
        return {
            "codec": stream["codec_name"],
            "width": width,
            "height": height,
            "duration_ms": None,
        }
    if not set(info.get("format", {}).get("format_name", "").split(",")) & {"mp3", "wav"}:
        raise HTTPException(status_code=422, detail="请选择 WAV 或 MP3 音频")
    if not any(s.get("codec_type") == "audio" for s in info.get("streams", [])):
        raise HTTPException(status_code=422, detail="音频中没有可用的音轨")
    try:
        # Decode to canonical PCM so duration is measured from real samples, not MP3 estimates.
        subprocess.run(
            [
                settings.ffmpeg_path,
                "-nostdin",
                "-v",
                "error",
                "-xerror",
                "-y",
                "-protocol_whitelist",
                "file,pipe",
                "-i",
                str(source),
                "-map",
                "0:a:0",
                "-t",
                "121",
                "-ac",
                "2",
                "-ar",
                "48000",
                "-c:a",
                "pcm_s16le",
                "-threads",
                "2",
                str(target),
            ],
            capture_output=True,
            timeout=30,
            check=True,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise HTTPException(status_code=422, detail="音频解码失败，未保存此素材") from exc
    normalized = probe(target)
    duration_ms = round(float(normalized["format"].get("duration", 0)) * 1000)
    if not 1 <= duration_ms <= 120_000:
        raise HTTPException(status_code=422, detail="单段配音最多 120 秒，请按镜头拆分；未截短保存")
    return {"codec": "pcm_s16le", "width": None, "height": None, "duration_ms": duration_ms}
