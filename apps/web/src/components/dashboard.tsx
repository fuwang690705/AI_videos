"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import useSWR from "swr";
import {
  ArrowRight,
  BookOpen,
  Clapperboard,
  Film,
  FolderKanban,
  Laugh,
  Plus,
  Search,
  Video,
  Layers3,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api, directionLabels, errorMessage } from "@/lib/api";
import { ProjectDialog } from "./project-dialog";
import { ErrorPanel, Loading } from "./ui";

const directionIcons = {
  MANGA: BookOpen,
  MEME_ANIMATION: Laugh,
  REALISTIC: Video,
};

export function Dashboard() {
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const projects = useSWR(["projects", deferredQuery, offset], () =>
    api.projects(deferredQuery, offset),
  );
  const overview = useSWR("overview", api.overview);
  const metrics = [
    { label: "创作项目", value: overview.data?.projects, icon: FolderKanban },
    { label: "故事剧集", value: overview.data?.episodes, icon: Film },
    { label: "剧情场景", value: overview.data?.scenes, icon: Layers3 },
    { label: "分镜草稿", value: overview.data?.shots, icon: Clapperboard },
  ];
  return (
    <div className="page-container">
      <section className="page-heading">
        <div>
          <div className="eyebrow">YOUR STORIES, IN PRODUCTION</div>
          <h1>
            项目中心<span className="heading-dot">.</span>
          </h1>
          <p>每一个好故事，都值得被看见。让创作从这里开始。</p>
        </div>
        <button className="button primary" onClick={() => setCreating(true)}>
          <Plus size={18} />
          新建项目
        </button>
      </section>
      <section className="metrics" aria-label="制作概览">
        {metrics.map(({ label, value, icon: Icon }, index) => (
          <div className="metric" key={label}>
            <div>
              <span>{label}</span>
              <strong>{value ?? "—"}</strong>
            </div>
            <div className={`metric-icon metric-${index}`}>
              <Icon size={21} />
            </div>
          </div>
        ))}
      </section>
      {overview.error && (
        <ErrorPanel
          message={errorMessage(overview.error)}
          retry={() => void overview.mutate()}
        />
      )}
      <section className="projects-section">
        <div className="section-toolbar">
          <div className="section-title">
            <h2>我的项目</h2>
            <span className="count-badge">{projects.data?.total ?? "—"}</span>
          </div>
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="搜索项目"
              placeholder="搜索项目名称…"
              value={query}
              maxLength={120}
              onChange={(event) => {
                setQuery(event.target.value);
                setOffset(0);
              }}
            />
          </label>
        </div>
        {projects.error ? (
          <ErrorPanel
            message={errorMessage(projects.error)}
            retry={() => void projects.mutate()}
          />
        ) : !projects.data ? (
          <Loading />
        ) : projects.data.items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration">
              <Clapperboard size={42} strokeWidth={1.3} />
              <span className="illustration-dot" />
            </div>
            <h3>{query ? "没有找到相关项目" : "你的第一个故事，即将开场"}</h3>
            <p>
              {query
                ? "试试其他项目名称，或清空搜索条件。"
                : "选择内容方向，建立剧集，再把故事拆解成镜头。"}
            </p>
            {query ? (
              <button className="button secondary" onClick={() => setQuery("")}>
                清空搜索
              </button>
            ) : (
              <button
                className="button primary"
                onClick={() => setCreating(true)}
              >
                <Plus size={17} />
                创建第一个项目
              </button>
            )}
            <div className="empty-directions">
              <span>
                <BookOpen size={15} />
                AI 漫剧
              </span>
              <span>
                <Laugh size={15} />
                沙雕动漫
              </span>
              <span>
                <Video size={15} />
                AI 真人剧
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="project-grid">
              {projects.data.items.map((project) => {
                const Icon = directionIcons[project.production_type];
                return (
                  <Link
                    className="project-card"
                    key={project.id}
                    href={`/projects/${project.id}`}
                  >
                    <div
                      className={`project-cover cover-${project.production_type.toLowerCase()}`}
                    >
                      <div className="cover-lines" />
                      <Icon size={46} strokeWidth={1.3} />
                      <span className="cover-tag">
                        {directionLabels[project.production_type]}
                      </span>
                    </div>
                    <div className="project-card-body">
                      <div className="project-card-title">
                        <h3>{project.name}</h3>
                        <ArrowRight size={18} />
                      </div>
                      <p>
                        {project.synopsis ||
                          "故事简介待补充，进入工作台开始规划。"}
                      </p>
                      <div className="project-card-meta">
                        <span className="draft-tag">筹备中</span>
                        <span>
                          {new Date(project.created_at).toLocaleDateString(
                            "zh-CN",
                            { timeZone: "Asia/Shanghai" },
                          )}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
            <div className="pagination">
              <span>共 {projects.data.total} 个项目</span>
              <div>
                <button
                  className="icon-button"
                  aria-label="上一页"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 12))}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>
                  {Math.floor(offset / 12) + 1} /{" "}
                  {Math.max(1, Math.ceil(projects.data.total / 12))}
                </span>
                <button
                  className="icon-button"
                  aria-label="下一页"
                  disabled={offset + 12 >= projects.data.total}
                  onClick={() => setOffset(offset + 12)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      <div className="bottom-note">
        <span className="status-dot" />
        项目与分镜已连接数据库<span>·</span>媒体生成能力将在后续接入
      </div>
      {creating && (
        <ProjectDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setQuery("");
            setOffset(0);
            void projects.mutate();
            void overview.mutate();
          }}
        />
      )}
    </div>
  );
}
