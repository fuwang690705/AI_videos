"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import {
  ArrowLeft,
  Clapperboard,
  Clock3,
  FileText,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
} from "lucide-react";
import { api, directionLabels, errorMessage, pad, type Shot } from "@/lib/api";
import { EntryDialog, ShotDialog } from "./entry-dialog";
import { ErrorPanel, Loading } from "./ui";

export function Workspace({ projectId }: { projectId: string }) {
  const project = useSWR(["project", projectId], () => api.project(projectId));
  const episodes = useSWR(["episodes", projectId], () =>
    api.episodes(projectId),
  );
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const episode =
    episodes.data?.find((item) => item.id === episodeId) ?? episodes.data?.[0];
  const scenes = useSWR(episode ? ["scenes", episode.id] : null, () =>
    api.scenes(episode!.id),
  );
  const [sceneId, setSceneId] = useState<string | null>(null);
  const scene =
    scenes.data?.find((item) => item.id === sceneId) ?? scenes.data?.[0];
  const shots = useSWR(scene ? ["shots", scene.id] : null, () =>
    api.shots(scene!.id),
  );
  const [dialog, setDialog] = useState<"episode" | "scene" | "shot" | null>(
    null,
  );
  const [editing, setEditing] = useState<Shot>();
  const nextEpisode =
    Math.max(0, ...(episodes.data?.map((item) => item.number) ?? [])) + 1;
  const nextScene =
    Math.max(0, ...(scenes.data?.map((item) => item.number) ?? [])) + 1;
  const nextShot =
    Math.max(0, ...(shots.data?.map((item) => item.number) ?? [])) + 1;
  if (project.error)
    return (
      <div className="page-container">
        <Link className="back-link" href="/">
          <ArrowLeft size={16} />
          返回项目中心
        </Link>
        <ErrorPanel
          message={errorMessage(project.error)}
          retry={() => void project.mutate()}
        />
      </div>
    );
  if (!project.data) return <Loading text="打开剧集工作台…" />;
  return (
    <div className="page-container workspace-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} />
        项目中心
      </Link>
      <section className="page-heading compact">
        <div>
          <div className="eyebrow">
            {directionLabels[project.data.production_type]}
            <span className="eyebrow-divider">/</span>剧集工作台
          </div>
          <h1>
            {project.data.name}
            <span className="heading-dot">.</span>
          </h1>
          <p className="project-synopsis">
            {project.data.synopsis ||
              "从剧集和场景开始，逐步完善你的故事分镜。"}
          </p>
        </div>
        <div className="workspace-actions">
          <Link
            className="button secondary"
            href={`/projects/${projectId}/media`}
          >
            <Clapperboard size={17} />
            素材与样片
          </Link>
          <Link
            className="button secondary"
            href={`/projects/${projectId}/story`}
          >
            <FileText size={17} />
            故事与设定
          </Link>
          <Link
            className="button primary"
            href={`/projects/${projectId}/create`}
          >
            <Clapperboard size={17} />
            进入魔因创作
          </Link>
        </div>
      </section>
      <div className="workspace-layout">
        <aside className="episode-panel">
          <div className="panel-heading">
            <h2>剧集</h2>
            <button
              className="icon-button"
              aria-label="新建剧集"
              onClick={() => setDialog("episode")}
            >
              <Plus size={18} />
            </button>
          </div>
          {episodes.error ? (
            <ErrorPanel
              message={errorMessage(episodes.error)}
              retry={() => void episodes.mutate()}
            />
          ) : !episodes.data ? (
            <Loading />
          ) : episodes.data.length === 0 ? (
            <div className="panel-empty">
              <FileText size={28} />
              <p>故事还没有分集</p>
              <button
                className="button secondary small"
                onClick={() => setDialog("episode")}
              >
                新建第一集
              </button>
            </div>
          ) : (
            <div className="episode-list">
              {episodes.data.map((item) => (
                <button
                  className={`episode-item ${item.id === episode?.id ? "selected" : ""}`}
                  key={item.id}
                  onClick={() => {
                    setEpisodeId(item.id);
                    setSceneId(null);
                  }}
                >
                  <span>EP{pad(item.number)}</span>
                  <strong>{item.title}</strong>
                  <small>分镜草稿</small>
                </button>
              ))}
            </div>
          )}
          <div className="episode-panel-footer">剧集 → 场景 → 分镜</div>
        </aside>
        <section className="storyboard-panel">
          {!episode ? (
            <div className="empty-state workspace-empty">
              <Clapperboard size={40} strokeWidth={1.3} />
              <h3>把故事，拆成镜头</h3>
              <p>先创建一集，再添加场景与分镜。</p>
            </div>
          ) : (
            <>
              <div className="panel-heading storyboard-heading">
                <div>
                  <span className="eyebrow">EP{pad(episode.number)}</span>
                  <h2>{episode.title}</h2>
                  {episode.synopsis && <p>{episode.synopsis}</p>}
                </div>
                <button
                  className="button secondary small"
                  onClick={() => setDialog("scene")}
                >
                  <Plus size={16} />
                  新建场景
                </button>
              </div>
              {scenes.error ? (
                <ErrorPanel
                  message={errorMessage(scenes.error)}
                  retry={() => void scenes.mutate()}
                />
              ) : !scenes.data ? (
                <Loading />
              ) : scenes.data.length === 0 ? (
                <div className="empty-state workspace-empty">
                  <MapPin size={34} />
                  <h3>故事发生在哪里？</h3>
                  <p>添加第一个场景，开始安排镜头。</p>
                  <button
                    className="button primary"
                    onClick={() => setDialog("scene")}
                  >
                    <Plus size={16} />
                    新建场景
                  </button>
                </div>
              ) : (
                <>
                  <div className="scene-tabs" aria-label="场景选择">
                    {scenes.data.map((item) => (
                      <button
                        key={item.id}
                        className={`scene-tab ${item.id === scene?.id ? "selected" : ""}`}
                        onClick={() => setSceneId(item.id)}
                      >
                        SC{pad(item.number)}
                        <span>{item.title}</span>
                      </button>
                    ))}
                  </div>
                  {scene && (
                    <div className="scene-content">
                      <div className="scene-toolbar">
                        <span>
                          <MapPin size={15} />
                          {scene.location || "地点待补充"}
                        </span>
                        <div>
                          <button
                            className="icon-button"
                            aria-label="刷新分镜"
                            onClick={() => void shots.mutate()}
                          >
                            <RefreshCw size={16} />
                          </button>
                          <button
                            className="button primary small"
                            onClick={() => {
                              setEditing(undefined);
                              setDialog("shot");
                            }}
                          >
                            <Plus size={16} />
                            新建分镜
                          </button>
                        </div>
                      </div>
                      {shots.error ? (
                        <ErrorPanel
                          message={errorMessage(shots.error)}
                          retry={() => void shots.mutate()}
                        />
                      ) : !shots.data ? (
                        <Loading />
                      ) : shots.data.length === 0 ? (
                        <div className="panel-empty">
                          <Clapperboard size={32} />
                          <p>还没有分镜，添加一个镜头试试。</p>
                        </div>
                      ) : (
                        <div className="shot-grid">
                          {shots.data.map((shot) => (
                            <article className="shot-card" key={shot.id}>
                              <div className="shot-card-heading">
                                <span>SHOT {pad(shot.number)}</span>
                                <span>
                                  <Clock3 size={13} />
                                  {shot.duration_seconds}s
                                </span>
                              </div>
                              <div className="shot-card-body">
                                <h3>{shot.title}</h3>
                                <p className="shot-description">
                                  {shot.visual_description ||
                                    "尚未填写画面描述"}
                                </p>
                                {shot.dialogue && (
                                  <blockquote>{shot.dialogue}</blockquote>
                                )}
                              </div>
                              <div className="shot-card-footer">
                                <span>草稿 · r{shot.revision}</span>
                                <button
                                  className="text-button"
                                  onClick={() => {
                                    setEditing(shot);
                                    setDialog("shot");
                                  }}
                                >
                                  <Pencil size={13} />
                                  编辑
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
      <div className="bottom-note">
        <span className="status-dot" />
        分镜保存为草稿<span>·</span>媒体生成与完整版本历史待接入
      </div>
      {dialog === "episode" && (
        <EntryDialog
          kind="episode"
          parentId={projectId}
          nextNumber={nextEpisode}
          onClose={() => setDialog(null)}
          onCreated={(id) => {
            setDialog(null);
            setEpisodeId(id);
            setSceneId(null);
            void episodes.mutate();
          }}
        />
      )}
      {dialog === "scene" && episode && (
        <EntryDialog
          kind="scene"
          parentId={episode.id}
          nextNumber={nextScene}
          onClose={() => setDialog(null)}
          onCreated={(id) => {
            setDialog(null);
            setSceneId(id);
            void scenes.mutate();
          }}
        />
      )}
      {dialog === "shot" && scene && (
        <ShotDialog
          sceneId={scene.id}
          nextNumber={nextShot}
          shot={editing}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void shots.mutate();
          }}
        />
      )}
    </div>
  );
}
