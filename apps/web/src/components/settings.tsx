"use client";

import useSWR from "swr";
import { BookOpen, Check, CircleDashed, Layers3 } from "lucide-react";
import { api, directionLabels, errorMessage } from "@/lib/api";
import { ErrorPanel, Loading } from "./ui";

export function Settings() {
  const profiles = useSWR("profiles", api.profiles);
  return (
    <div className="page-container">
      <section className="page-heading">
        <div>
          <div className="eyebrow">PRODUCTION FOUNDATIONS</div>
          <h1>
            生产配置<span className="heading-dot">.</span>
          </h1>
          <p>故事共用底座，不同内容方向走各自的生产路线。</p>
        </div>
        <span className="local-pill">基础框架 v0.1</span>
      </section>
      {profiles.error ? (
        <ErrorPanel
          message={errorMessage(profiles.error)}
          retry={() => void profiles.mutate()}
        />
      ) : !profiles.data ? (
        <Loading />
      ) : (
        <div className="profile-grid">
          {profiles.data.map((profile) => (
            <article className="profile-card" key={profile.id}>
              <div className="profile-icon">
                <Layers3 size={24} />
              </div>
              <span className="eyebrow">
                {directionLabels[profile.production_type]}
              </span>
              <h2>{profile.name}</h2>
              <p>{profile.description}</p>
              <dl>
                <div>
                  <dt>配置版本</dt>
                  <dd>v{profile.version}</dd>
                </div>
                <div>
                  <dt>渲染引擎</dt>
                  <dd>{profile.renderer}</dd>
                </div>
                <div>
                  <dt>视频模式</dt>
                  <dd>
                    {profile.video_mode === "procedural"
                      ? "程序动画"
                      : "生成式视频"}
                  </dd>
                </div>
              </dl>
              <span className="pending-tag">
                <CircleDashed size={14} />
                {profile.generation_enabled ? "已启用生成" : "生成引擎尚未接入"}
              </span>
            </article>
          ))}
        </div>
      )}
      <div className="foundation-note">
        <BookOpen size={23} />
        <div>
          <h2>框架已经就位，能力逐步接入</h2>
          <p>
            当前可以创建项目、剧集、场景，编辑分镜草稿。配置版本随项目保存；模型、配音、渲染和人工审核将在后续开发中接入。
          </p>
          <div className="capability-list">
            <span>
              <Check size={15} />
              项目与分镜管理
            </span>
            <span>
              <Check size={15} />
              生产配置绑定
            </span>
            <span>
              <CircleDashed size={15} />
              模型与媒体生成
            </span>
            <span>
              <CircleDashed size={15} />
              质检与预算控制
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
