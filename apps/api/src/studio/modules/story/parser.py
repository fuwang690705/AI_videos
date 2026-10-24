"""Explicit structured-script import. This parser performs no AI inference."""

import hashlib
import re
from uuid import UUID, uuid5

from fastapi import HTTPException
from pydantic import ValidationError

from studio.modules.catalog.models import Project
from studio.modules.catalog.schemas import ProjectCreate
from studio.modules.creation.schemas import CreationSnapshot
from studio.modules.story.schemas import StoryContent

HEADERS = (
    ("episode", re.compile(r"第\s*(\d{1,6})\s*集\s*[:：]\s*(.+)")),
    ("scene", re.compile(r"场景\s*(\d{1,6})\s*[:：]\s*(.+)")),
    ("shot", re.compile(r"分镜\s*(\d{1,6})\s*[:：]\s*(.+)")),
)
SHOT_FIELDS = {
    "画面": "visual_description",
    "对白": "dialogue",
    "时长": "duration_seconds",
    "动作": "action_summary",
    "景别": "shot_size",
    "镜头运动": "camera_movement",
    "特殊手法": "special_technique",
}


def parse_script(project: Project, story: StoryContent) -> CreationSnapshot:
    text = story.source_text.lstrip("\ufeff").replace("\r\n", "\n")
    signature = hashlib.sha256(text.encode()).hexdigest()
    episodes: list[dict] = []
    episode = scene = shot = None
    current_field: tuple[dict, str] | None = None
    blank_lines = 0
    seen_fields: set[tuple[str, str]] = set()

    def fail(line: int, reason: str):
        raise HTTPException(status_code=422, detail=f"第 {line} 行：{reason}。请参考结构化剧本模板")

    def record_id(path: str) -> str:
        # Stable IDs ensure re-previewing unchanged text yields the same save identity.
        return str(uuid5(UUID(str(project.id)), f"{signature}/{path}"))

    for line_number, raw in enumerate(text.split("\n"), 1):
        value = raw.strip()
        if not value:
            blank_lines += 1
            continue
        # Indented lines always continue text, including dialogue resembling a header.
        if raw[:1].isspace() and current_field:
            target, field = current_field
            target[field] += "\n" * (blank_lines + 1) + raw.lstrip()
            blank_lines = 0
            continue
        blank_lines = 0
        matched = False
        for kind, pattern in HEADERS:
            match = pattern.fullmatch(value)
            if not match:
                continue
            number, title = int(match[1]), match[2]
            current_field = None
            matched = True
            if kind == "episode":
                episode = {
                    "id": record_id(f"ep/{number}"),
                    "number": number,
                    "title": title,
                    "scenes": [],
                }
                episodes.append(episode)
                scene = shot = None
            elif kind == "scene":
                if episode is None:
                    fail(line_number, "场景前需要先写剧集标题")
                scene = {
                    "id": record_id(f"ep/{episode['number']}/sc/{number}"),
                    "number": number,
                    "title": title,
                    "shots": [],
                }
                episode["scenes"].append(scene)
                shot = None
            else:
                if scene is None:
                    fail(line_number, "分镜前需要先写场景标题")
                shot = {
                    "id": record_id(f"ep/{episode['number']}/sc/{scene['number']}/sh/{number}"),
                    "number": number,
                    "title": title,
                    "details": {},
                }
                scene["shots"].append(shot)
            break
        if matched:
            continue
        parts = re.split(r"[:：]", value, maxsplit=1)
        if len(parts) != 2:
            fail(line_number, "无法识别此行，请为多行字段的续行添加缩进")
        label, content = parts[0].strip(), parts[1].lstrip()
        if label == "简介" and episode is not None and scene is None:
            target, field, owner = episode, "synopsis", episode["id"]
        elif label == "地点" and scene is not None and shot is None:
            target, field, owner = scene, "location", scene["id"]
        elif label in SHOT_FIELDS and shot is not None:
            field, owner = SHOT_FIELDS[label], shot["id"]
            target = (
                shot
                if field in {"visual_description", "dialogue", "duration_seconds"}
                else shot["details"]
            )
        else:
            fail(line_number, "字段名称或所属层级不正确")
        if (owner, field) in seen_fields:
            fail(line_number, f"{label}重复，续行请添加缩进")
        seen_fields.add((owner, field))
        if field == "duration_seconds":
            if not re.fullmatch(r"\d{1,3}", content):
                fail(line_number, "时长必须是 1–120 的整数秒")
            target[field] = int(content)
            current_field = None
        else:
            target[field] = content
            current_field = (
                (target, field)
                if field in {"synopsis", "visual_description", "dialogue", "action_summary"}
                else None
            )

    if not episodes or not any(sc["shots"] for ep in episodes for sc in ep["scenes"]):
        raise HTTPException(
            status_code=422,
            detail="需要至少一集、一个场景和一个分镜；普通小说请先保存，自动拆解尚未接入",
        )
    try:
        return CreationSnapshot(
            schema_version=1,
            project=ProjectCreate(
                name=project.name,
                synopsis=project.synopsis,
                production_type=project.production_type,
                profile_id=project.profile_id,
            ),
            episodes=episodes,
            story=story,
        )
    except ValidationError as exc:
        # Never silently truncate or renumber malformed scripts.
        raise HTTPException(
            status_code=422, detail=exc.errors(include_context=False, include_input=False)
        ) from exc
