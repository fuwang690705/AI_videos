"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import {
  ArrowLeft,
  Download,
  Film,
  ImagePlus,
  Music,
  RefreshCw,
  Save,
} from "lucide-react";
import {
  api,
  assetUrl,
  renderUrl,
  errorMessage,
  type CreationSnapshot,
  type MediaAsset,
  type MediaBinding,
  type RenderJob,
  type Shot,
} from "@/lib/api";
import { ErrorPanel, Loading } from "./ui";
import { ShotDialog } from "./entry-dialog";

type SnapshotShot =
  CreationSnapshot["episodes"][number]["scenes"][number]["shots"][number];

export function MediaWorkspace({ projectId }: { projectId: string }) {
  const snapshot = useSWR(["snapshot", projectId], () =>
    api.creationSnapshot(projectId),
  );
  const assets = useSWR(["assets", projectId], () =>
    api.mediaAssets(projectId),
  );
  const bindings = useSWR(
    ["bindings", projectId],
    () => api.mediaBindings(projectId),
    { revalidateOnFocus: false },
  );
  const capabilities = useSWR("media-capabilities", api.mediaCapabilities);
  const renders = useSWR(["renders", projectId], () => api.renders(projectId), {
    refreshInterval: (data) =>
      data?.some((job) => job.status === "queued" || job.status === "running")
        ? 1000
        : 5000,
  });
  const [episodeId, setEpisodeId] = useState<string>();
  const [orientation, setOrientation] = useState<"landscape" | "portrait">(
    "landscape",
  );
  const [kind, setKind] = useState<"image" | "audio">("image");
  const [sourceNote, setSourceNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<{ sceneId: string; shot: Shot }>();
  const episode =
    snapshot.data?.episodes.find((ep) => ep.id === episodeId) ??
    snapshot.data?.episodes[0];
  const firstError =
    snapshot.error ??
    assets.error ??
    bindings.error ??
    capabilities.error ??
    renders.error;
  const refresh = () => {
    void snapshot.mutate();
    void assets.mutate();
    void bindings.mutate();
    void renders.mutate();
    void capabilities.mutate();
  };
  const submit = async (fresh = false) => {
    if (!episode) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const key = `studio-render:${projectId}:${episode.id}:${orientation}`;
      const signature = JSON.stringify({
        shots: episode.scenes.flatMap((sc) => sc.shots),
        bindings: bindings.data,
        orientation,
      });
      let previous: { signature: string; requestId: string } | null = null;
      try {
        previous = JSON.parse(sessionStorage.getItem(key) ?? "null");
      } catch {
        /* fresh request */
      }
      const requestId =
        !fresh && previous?.signature === signature
          ? previous.requestId
          : crypto.randomUUID();
      sessionStorage.setItem(key, JSON.stringify({ signature, requestId }));
      await api.createRender(projectId, {
        request_id: requestId,
        episode_id: episode.id,
        orientation,
      });
      await renders.mutate();
      setNotice(
        "任务已保存到本地队列。输入已锁定，可继续编辑，当前样片不受影响。",
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  if (firstError)
    return (
      <div className="page-container">
        <ErrorPanel message={errorMessage(firstError)} retry={refresh} />
      </div>
    );
  if (
    !snapshot.data ||
    !assets.data ||
    !bindings.data ||
    !capabilities.data ||
    !renders.data
  )
    return <Loading text="打开素材与样片工作台…" />;
  const flatShots =
    episode?.scenes.flatMap((sc) =>
      sc.shots.map((shot) => ({ shot, scene: sc })),
    ) ?? [];
  const boundCount = flatShots.filter(
    ({ shot }) =>
      bindings.data?.find((binding) => binding.shot_id === shot.id)
        ?.image_asset_id,
  ).length;
  return (
    <div className="page-container media-page">
      <Link className="back-link" href={`/projects/${projectId}`}>
        <ArrowLeft size={16} />
        返回剧集工作台
      </Link>
      <section className="page-heading compact">
        <div>
          <div className="eyebrow">{snapshot.data.project.name} / 本地制作</div>
          <h1>
            素材与样片<span className="heading-dot">.</span>
          </h1>
          <p>绑定图片和配音，按分镜顺序合成可预览、可确认、可下载的样片。</p>
        </div>
        <button className="button secondary small" onClick={refresh}>
          <RefreshCw size={15} />
          刷新数据
        </button>
      </section>
      <nav className="production-steps" aria-label="制作流程">
        <Link href={`/projects/${projectId}/story`}>
          <b>01</b>故事与设定
        </Link>
        <Link href={`/projects/${projectId}`}>
          <b>02</b>剧集与分镜
        </Link>
        <span aria-current="step">
          <b>03</b>素材与样片
        </span>
        <span>
          <b>04</b>样片确认与下载
        </span>
      </nav>
      <div className="media-mode-note">
        <Film size={22} />
        <div>
          <strong>本地分镜样片 · 静态图片 + 配音 + 字幕文件</strong>
          <p>
            这是已有素材的合成流程，尚未接入 AI
            图片/视频生成、角色动画和口型。字幕按镜头区间排列，不代表逐字语音对齐。
          </p>
        </div>
      </div>
      {!capabilities.data.rendering_available && (
        <ErrorPanel message={capabilities.data.detail} />
      )}
      <section className="asset-upload-panel" aria-label="素材上传">
        <div>
          <h2>添加本地素材</h2>
          <p>
            PNG / JPEG / WebP 图片，WAV / MP3 配音；单文件最多 8 MB，配音最多
            120 秒。
          </p>
        </div>
        <div className="asset-upload-controls">
          <label className="field">
            素材类型
            <select
              aria-label="素材类型"
              value={kind}
              disabled={busy}
              onChange={(event) =>
                setKind(event.target.value as "image" | "audio")
              }
            >
              <option value="image">镜头图片</option>
              <option value="audio">镜头配音</option>
            </select>
          </label>
          <label className="field asset-source-note">
            来源与用途
            <input
              aria-label="素材来源与用途"
              value={sourceNote}
              onChange={(event) => setSourceNote(event.target.value)}
              maxLength={1000}
              placeholder="例如：自己绘制，用于试播样片"
              disabled={busy}
            />
          </label>
          <label className="button primary file-button">
            {kind === "image" ? <ImagePlus size={16} /> : <Music size={16} />}
            {busy ? "处理中…" : "选择并上传"}
            <input
              aria-label="上传素材文件"
              type="file"
              accept={kind === "image" ? ".png,.jpg,.jpeg,.webp" : ".wav,.mp3"}
              disabled={busy || !capabilities.data.rendering_available}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setBusy(true);
                setError("");
                setNotice("");
                try {
                  await api.uploadMedia(projectId, kind, file, sourceNote);
                  await assets.mutate();
                  setNotice(`素材「${file.name}」已校验并保存`);
                } catch (cause) {
                  setError(errorMessage(cause));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        </div>
        <p className="media-library-summary">
          素材库：{assets.data.filter((a) => a.kind === "image").length} 张图片
          · {assets.data.filter((a) => a.kind === "audio").length} 段配音
        </p>
      </section>
      {error && <ErrorPanel message={error} />}
      {notice && (
        <p role="status" className="story-notice">
          {notice}
        </p>
      )}
      <section className="media-plan" aria-label="镜头素材绑定">
        <div className="panel-heading">
          <div>
            <h2>镜头素材与时长</h2>
            <p>
              图片已绑定 {boundCount} / {flatShots.length} ·
              每个镜头都需图片，未绑定配音的镜头使用静音
            </p>
          </div>
          <label className="field episode-picker">
            选择剧集
            <select
              aria-label="选择样片剧集"
              value={episode?.id ?? ""}
              onChange={(event) => setEpisodeId(event.target.value)}
            >
              {snapshot.data.episodes.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  EP{ep.number} · {ep.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {flatShots.length === 0 ? (
          <p className="panel-empty">
            先在剧集工作台或故事导入页创建分镜，再来绑定素材。
          </p>
        ) : (
          <div className="media-shot-list">
            {flatShots.map(({ shot, scene }) => (
              <BindingEditor
                key={`${shot.id}-${bindings.data?.find((b) => b.shot_id === shot.id)?.revision ?? 0}`}
                projectId={projectId}
                shot={shot}
                sceneTitle={`SC${scene.number} · ${scene.title}`}
                assets={assets.data!}
                binding={bindings.data?.find((b) => b.shot_id === shot.id)}
                onSaved={() => void bindings.mutate()}
                onEdit={async () => {
                  try {
                    const records = await api.shots(scene.id);
                    const record = records.find((item) => item.id === shot.id);
                    if (!record) throw new Error("分镜不存在，请刷新");
                    setEditing({ sceneId: scene.id, shot: record });
                  } catch (cause) {
                    setError(errorMessage(cause));
                  }
                }}
              />
            ))}
          </div>
        )}
        <div className="render-controls">
          <label className="field">
            画幅
            <select
              aria-label="样片画幅"
              value={orientation}
              onChange={(event) =>
                setOrientation(event.target.value as "landscape" | "portrait")
              }
            >
              <option value="landscape">横屏 16:9 · 1280×720</option>
              <option value="portrait">竖屏 9:16 · 720×1280</option>
            </select>
          </label>
          <span>
            {flatShots.reduce(
              (sum, { shot }) => sum + (shot.duration_seconds ?? 5),
              0,
            )}{" "}
            秒 · 最多 300 秒 / 100 镜头
          </span>
          <button
            className="button primary"
            disabled={
              busy ||
              !flatShots.length ||
              !capabilities.data.rendering_available
            }
            onClick={() => void submit()}
          >
            <Film size={16} />
            生成本地样片
          </button>
          <button
            className="button secondary small"
            disabled={
              busy ||
              !flatShots.length ||
              !capabilities.data.rendering_available
            }
            onClick={() => void submit(true)}
          >
            重新提交新任务
          </button>
        </div>
      </section>
      <section
        id="renders"
        className="render-history"
        aria-label="样片任务与交付"
      >
        <div className="panel-heading">
          <h2>样片任务、人工确认与下载</h2>
        </div>
        {renders.data.length === 0 ? (
          <p className="panel-empty">
            尚无样片任务。提交后会显示真实队列与渲染进度。
          </p>
        ) : (
          renders.data.map((job) => (
            <RenderCard
              key={job.id}
              projectId={projectId}
              job={job}
              episodeTitle={
                snapshot.data?.episodes.find((ep) => ep.id === job.episode_id)
                  ?.title ?? "剧集样片"
              }
              onChanged={() => void renders.mutate()}
            />
          ))
        )}
      </section>
      {editing && (
        <ShotDialog
          sceneId={editing.sceneId}
          nextNumber={editing.shot.number + 1}
          shot={editing.shot}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void snapshot.mutate();
          }}
        />
      )}
    </div>
  );
}

function BindingEditor({
  projectId,
  shot,
  sceneTitle,
  assets,
  binding,
  onSaved,
  onEdit,
}: {
  projectId: string;
  shot: SnapshotShot;
  sceneTitle: string;
  assets: MediaAsset[];
  binding?: MediaBinding;
  onSaved: () => void;
  onEdit: () => void;
}) {
  const [imageId, setImageId] = useState(binding?.image_asset_id ?? "");
  const [audioId, setAudioId] = useState(binding?.audio_asset_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const image = assets.find((asset) => asset.id === imageId);
  const audio = assets.find((asset) => asset.id === audioId);
  return (
    <article
      className="media-shot"
      aria-label={`镜头 ${shot.number} ${shot.title}`}
    >
      <div className="bound-image">
        {image ? (
          <Image
            src={assetUrl(projectId, image.id)}
            alt={image.filename}
            width={320}
            height={180}
            unoptimized
          />
        ) : (
          <div>
            <ImagePlus size={25} />
            <span>待绑定图片</span>
          </div>
        )}
      </div>
      <div className="media-shot-fields">
        <small>
          {sceneTitle} / SHOT {shot.number}
        </small>
        <div className="media-shot-title">
          <h3>{shot.title}</h3>
          <span>{shot.duration_seconds}s</span>
          <button className="text-button" onClick={onEdit}>
            编辑分镜与时长
          </button>
        </div>
        <p>{shot.dialogue || "无对白"}</p>
        <div className="binding-controls">
          <label className="field">
            镜头图片
            <select
              aria-label={`镜头 ${shot.number} 图片`}
              value={imageId}
              onChange={(event) => setImageId(event.target.value)}
              disabled={busy}
            >
              <option value="">未绑定</option>
              {assets
                .filter((a) => a.kind === "image")
                .map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.filename}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            镜头配音
            <select
              aria-label={`镜头 ${shot.number} 配音`}
              value={audioId}
              onChange={(event) => setAudioId(event.target.value)}
              disabled={busy}
            >
              <option value="">静音</option>
              {assets
                .filter((a) => a.kind === "audio")
                .map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.filename} ·{" "}
                    {((asset.duration_ms ?? 0) / 1000).toFixed(2)}s
                  </option>
                ))}
            </select>
          </label>
          <button
            className="button secondary small"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api.bindMedia(projectId, shot.id, {
                  revision: binding?.revision ?? 0,
                  image_asset_id: imageId || null,
                  audio_asset_id: audioId || null,
                });
                onSaved();
              } catch (cause) {
                setError(errorMessage(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Save size={14} />
            保存素材绑定
          </button>
        </div>
        {audio && (
          <audio
            controls
            preload="none"
            src={assetUrl(projectId, audio.id)}
            aria-label={`分镜 ${shot.number} 配音试听`}
          />
        )}
        {image?.source_note && <small>来源：{image.source_note}</small>}
        {error && <ErrorPanel message={error} />}
      </div>
    </article>
  );
}

function RenderCard({
  projectId,
  job,
  episodeTitle,
  onChanged,
}: {
  projectId: string;
  job: RenderJob;
  episodeTitle: string;
  onChanged: () => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const reviews = useSWR(showReviews ? ["render-reviews", job.id] : null, () =>
    api.renderReviews(projectId, job.id),
  );
  const review = async (decision: "approved" | "changes_requested") => {
    setBusy(true);
    setError("");
    try {
      await api.reviewRender(projectId, job.id, { decision, note });
      setNote("");
      onChanged();
      void reviews.mutate();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const labels = {
    queued: "队列等待中",
    running: "正在渲染",
    succeeded: "样片已完成",
    failed: "渲染失败",
  };
  const reviewLabels = {
    pending: "待人工确认",
    approved: "已人工确认",
    changes_requested: "已退回修改",
  };
  return (
    <article className="render-card" aria-label={`样片任务 ${job.id}`}>
      <div className="render-card-heading">
        <div>
          <h3>{episodeTitle}</h3>
          <p>
            {job.width}×{job.height} · {job.duration_ms / 1000}s ·{" "}
            {new Date(job.created_at).toLocaleString()}
          </p>
        </div>
        <span className={`render-status status-${job.status}`}>
          {labels[job.status]}
        </span>
      </div>
      {(job.status === "queued" || job.status === "running") && (
        <div className="render-progress">
          <progress
            max={job.total_shots}
            value={job.completed_shots}
            aria-label="样片镜头处理进度"
          />
          <span>
            {job.completed_shots} / {job.total_shots} 镜头
          </span>
          <p>
            任务输入已锁定。请保持 npm run dev:local 运行；也可单独运行 npm run
            dev:render。
          </p>
        </div>
      )}
      {job.status === "failed" && (
        <ErrorPanel message={job.error || "渲染失败，请重新提交新任务"} />
      )}
      {job.status === "succeeded" && (
        <>
          <video
            className="render-video"
            controls
            preload="metadata"
            aria-label="分镜样片预览"
          >
            <source
              src={renderUrl(projectId, job.id, "video")}
              type="video/mp4"
            />
            <track
              kind="subtitles"
              src={renderUrl(projectId, job.id, "vtt")}
              srcLang="zh"
              label="分镜对白"
              default
            />
          </video>
          <div className="render-downloads">
            <span className={`review-status review-${job.review_status}`}>
              {reviewLabels[job.review_status]}
            </span>
            <a
              className="button primary small"
              href={renderUrl(projectId, job.id, "video")}
              download
            >
              <Download size={15} />
              下载 MP4 样片
            </a>
            <a
              className="button secondary small"
              href={renderUrl(projectId, job.id, "srt")}
            >
              下载 SRT 字幕
            </a>
            <a
              className="text-button"
              href={renderUrl(projectId, job.id, "manifest")}
            >
              下载制作清单
            </a>
          </div>
          <div className="render-review">
            <label className="field">
              样片确认备注
              <textarea
                aria-label={`样片 ${job.id} 确认备注`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={2000}
                rows={2}
                disabled={busy}
                placeholder="需修改时请填写原因；确认只针对这份样片。"
              />
            </label>
            <div>
              <button
                className="button secondary small"
                disabled={busy}
                onClick={() => void review("approved")}
              >
                确认这份样片
              </button>
              <button
                className="button secondary small"
                disabled={busy || !note.trim()}
                onClick={() => void review("changes_requested")}
              >
                退回修改
              </button>
              <button
                className="text-button"
                onClick={() => setShowReviews(!showReviews)}
              >
                查看确认记录
              </button>
            </div>
          </div>
          {showReviews && (
            <div className="review-history">
              {reviews.error ? (
                <ErrorPanel message={errorMessage(reviews.error)} />
              ) : !reviews.data ? (
                <Loading />
              ) : reviews.data.length === 0 ? (
                <p>尚无确认记录</p>
              ) : (
                reviews.data.map((item) => (
                  <p key={item.id}>
                    {item.decision === "approved" ? "已确认" : "退回修改"} ·{" "}
                    {item.note || "无备注"} ·{" "}
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                ))
              )}
            </div>
          )}
        </>
      )}
      {error && <ErrorPanel message={error} />}
    </article>
  );
}
