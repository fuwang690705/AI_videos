"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { ArrowLeft, BookOpen, FileText, Save, Upload } from "lucide-react";
import {
  api,
  errorMessage,
  type CreationSnapshot,
  type Project,
  type StoryDraft,
} from "@/lib/api";
import { ErrorPanel, Loading } from "./ui";

const template = `第1集：雨夜来信
简介：一封来自未来的信，改变了主人公的计划。
场景1：城市天台
地点：天台 · 夜
分镜1：信封特写
画面：雨落在旧信封上，镜头缓慢推近。
动作：主人公拿起信封。
对白：你终于来了。
时长：6
景别：CU
镜头运动：dolly-in
分镜2：抬头
画面：主人公望向远处的灯光。
对白：明天，一切都会改变。
时长：5`;

const noteFields = [
  ["outline", "故事大纲", "主线冲突、分集目标与情节走向"],
  ["world_setting", "世界观与风格", "时代、地点、叙事风格与世界规则"],
  ["character_notes", "人物设定", "人物身份、关系、目标与外观约束"],
  [
    "continuity_notes",
    "连续性约束",
    "已经发生的事实、角色知识与不能提前揭露的情节",
  ],
] as const;
type Form = {
  source_text: string;
  outline: string;
  world_setting: string;
  character_notes: string;
  continuity_notes: string;
};

export function Story({ projectId }: { projectId: string }) {
  const project = useSWR(["project", projectId], () => api.project(projectId));
  const draft = useSWR(["story", projectId], () => api.story(projectId), {
    revalidateOnFocus: false,
  });
  if (project.error || draft.error)
    return (
      <div className="page-container">
        <ErrorPanel
          message={errorMessage(project.error ?? draft.error)}
          retry={() => {
            void project.mutate();
            void draft.mutate();
          }}
        />
      </div>
    );
  if (!project.data || !draft.data) return <Loading text="打开故事与设定…" />;
  return (
    <StoryEditor key={projectId} project={project.data} initial={draft.data} />
  );
}

function StoryEditor({
  project,
  initial,
}: {
  project: Project;
  initial: StoryDraft;
}) {
  const [form, setForm] = useState<Form>({
    source_text: initial.source_text ?? "",
    outline: initial.outline ?? "",
    world_setting: initial.world_setting ?? "",
    character_notes: initial.character_notes ?? "",
    continuity_notes: initial.continuity_notes ?? "",
  });
  const [revision, setRevision] = useState(initial.revision);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<CreationSnapshot>();
  const [copyName, setCopyName] = useState(
    `${project.name.slice(0, 114)}·剧本稿`,
  );
  const [saved, setSaved] = useState<Project>();
  const change = (key: keyof Form, value: string) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
    setPreview(undefined);
    setNotice("");
    setSaved(undefined);
  };
  const save = async (withPreview: boolean) => {
    setBusy(true);
    setError("");
    setNotice("");
    setSaved(undefined);
    try {
      let currentRevision = revision;
      if (dirty || revision === 0) {
        const result = await api.saveStory(project.id, { ...form, revision });
        currentRevision = result.revision;
        setRevision(currentRevision);
        setDirty(false);
      }
      setNotice(`故事草稿 r${currentRevision} 已保存`);
      if (withPreview)
        setPreview(await api.previewScript(project.id, currentRevision));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const digest = new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(
            JSON.stringify({ name: copyName, snapshot: preview }),
          ),
        ),
      );
      const hex = Array.from(digest, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const requestId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      setSaved(
        await api.saveCreationCopy({
          request_id: requestId,
          name: copyName,
          snapshot: preview,
        }),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const scenes = preview?.episodes.flatMap((ep) => ep.scenes) ?? [];
  const shots = scenes.flatMap((scene) => scene.shots);
  return (
    <div className="page-container story-page">
      <Link className="back-link" href={`/projects/${project.id}`}>
        <ArrowLeft size={16} />
        返回剧集工作台
      </Link>
      <section className="page-heading compact">
        <div>
          <div className="eyebrow">{project.name} / 故事起点</div>
          <h1>
            故事与设定<span className="heading-dot">.</span>
          </h1>
          <p>保存原文与创作约束，再把已有剧本整理成可编辑的分镜。</p>
        </div>
        <span className="draft-tag">
          {dirty ? "有未保存修改" : revision ? `草稿 r${revision}` : "新草稿"}
        </span>
      </section>
      <nav className="production-steps" aria-label="制作流程">
        <span aria-current="step">
          <b>01</b>故事与设定
        </span>
        <Link href={`/projects/${project.id}`}>
          <b>02</b>剧集与分镜
        </Link>
        <Link href={`/projects/${project.id}/media`}>
          <b>03</b>素材与样片
        </Link>
        <Link href={`/projects/${project.id}/media#renders`}>
          <b>04</b>样片确认与下载
        </Link>
      </nav>
      <div className="story-layout">
        <section className="story-source" aria-label="故事原文">
          <div className="panel-heading">
            <h2>
              <FileText size={18} />
              故事原文 / 已有剧本
            </h2>
            <label
              className={`button secondary small file-button ${busy ? "disabled" : ""}`}
            >
              <Upload size={15} />
              导入文本
              <input
                aria-label="导入故事文本"
                type="file"
                accept=".txt,.md,text/plain,text/markdown"
                disabled={busy}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  setError("");
                  try {
                    if (file.size > 500_000)
                      throw new Error("文本文件过大，请先拆分至 10 万字以内。");
                    const text = new TextDecoder("utf-8", {
                      fatal: true,
                    }).decode(await file.arrayBuffer());
                    if (text.length > 100_000)
                      throw new Error(
                        "每份故事原文最多 10 万字，请按章节拆分导入。",
                      );
                    change("source_text", text);
                  } catch {
                    setError(
                      "无法导入文本，请使用 UTF-8 编码的 TXT / Markdown 文件，且不超过 10 万字、500 KB。",
                    );
                  }
                }}
              />
            </label>
          </div>
          <label className="field">
            故事原文
            <textarea
              aria-label="故事原文"
              value={form.source_text}
              maxLength={100000}
              rows={23}
              disabled={busy}
              onChange={(event) => change("source_text", event.target.value)}
              placeholder="可以保存小说、大纲或剧本。导入目录预览需要采用下方的结构化剧本格式。"
            />
          </label>
          <div className="source-caption">
            <span>{form.source_text.length.toLocaleString()} / 100,000 字</span>
            <span>原文与设定均保存到项目数据库</span>
          </div>
          <details className="script-template">
            <summary>查看结构化剧本导入模板</summary>
            <p>
              按「第 N 集 / 场景 N / 分镜
              N」组织，字段使用冒号分隔。多行画面、动作或对白的续行需缩进。时长为
              1–120 的整数秒。
            </p>
            <pre>{template}</pre>
            <button
              className="button secondary small"
              disabled={busy || !!form.source_text}
              onClick={() => change("source_text", template)}
            >
              填入模板（仅限空白原文）
            </button>
          </details>
          <div className="story-buttons">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void save(false)}
            >
              <Save size={16} />
              {busy ? "处理中…" : "保存故事草稿"}
            </button>
            <button
              className="button primary"
              disabled={busy || !form.source_text.trim()}
              onClick={() => void save(true)}
            >
              <BookOpen size={16} />
              保存并预览目录
            </button>
          </div>
        </section>
        <aside className="story-notes" aria-label="创作设定">
          <h2>创作设定</h2>
          <p>
            这些是工作草稿。当前不代表已批准的剧情事实，也不会自动调用模型。
          </p>
          {noteFields.map(([key, label, hint]) => (
            <label className="field" key={key}>
              {label}
              <textarea
                aria-label={label}
                value={form[key]}
                maxLength={10000}
                rows={4}
                placeholder={hint}
                disabled={busy}
                onChange={(event) => change(key, event.target.value)}
              />
            </label>
          ))}
        </aside>
      </div>
      {notice && (
        <p className="story-notice" role="status">
          {notice}
        </p>
      )}
      {error && <ErrorPanel message={error} />}
      <p className="bottom-note">
        普通小说可先保存原文与设定；自动拆解和真实 AI
        生成尚未接入。目录预览只解析你已经写好的结构化剧本，不补写内容。
      </p>
      {preview && (
        <section className="script-preview" aria-label="剧本目录预览">
          <div className="panel-heading">
            <div>
              <div className="eyebrow">确认后另存，不覆盖当前项目</div>
              <h2>剧本目录预览</h2>
              <p>
                {preview.episodes.length} 集 · {scenes.length} 场景 ·{" "}
                {shots.length} 分镜
              </p>
            </div>
          </div>
          <div className="preview-tree">
            {preview.episodes.map((ep) => (
              <article key={ep.id}>
                <h3>
                  EP{ep.number} · {ep.title}
                </h3>
                {ep.scenes.map((scene) => (
                  <div key={scene.id}>
                    <h4>
                      SC{scene.number} · {scene.title}
                    </h4>
                    <p>{scene.location}</p>
                    {scene.shots.map((shot) => (
                      <div className="preview-shot" key={shot.id}>
                        <strong>
                          {shot.number}. {shot.title}
                        </strong>
                        <span>{shot.duration_seconds}s</span>
                        <p>{shot.visual_description}</p>
                        {shot.dialogue && (
                          <blockquote>{shot.dialogue}</blockquote>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </article>
            ))}
          </div>
          <div className="story-confirm">
            <label className="field">
              剧本副本名称
              <input
                aria-label="剧本副本名称"
                value={copyName}
                onChange={(event) => setCopyName(event.target.value)}
                maxLength={120}
                disabled={busy}
              />
            </label>
            <button
              className="button primary"
              disabled={busy || !copyName.trim()}
              onClick={() => void confirm()}
            >
              确认并另存为项目
            </button>
          </div>
          <p className="creator-scope">
            原文、设定和分镜一起保存到副本。同名同内容重复确认会返回同一个副本。
          </p>
        </section>
      )}
      {saved && (
        <div className="creator-saved" role="status">
          已保存「{saved.name}」，原项目保留。
          <Link href={`/projects/${saved.id}`}>打开剧本副本 →</Link>
          <Link href={`/projects/${saved.id}/create`}>继续编辑分镜 →</Link>
        </div>
      )}
    </div>
  );
}
