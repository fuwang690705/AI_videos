"use client";

import { useState } from "react";
import useSWR from "swr";
import { BookOpen, Laugh, Video, LoaderCircle } from "lucide-react";
import {
  api,
  directionLabels,
  errorMessage,
  type ProductionType,
} from "@/lib/api";
import { ErrorPanel, Loading, Modal } from "./ui";

const directions = [
  { type: "MANGA" as const, icon: BookOpen, description: "画风与角色一致" },
  {
    type: "MEME_ANIMATION" as const,
    icon: Laugh,
    description: "素材与程序动画",
  },
  { type: "REALISTIC" as const, icon: Video, description: "身份与镜头表现" },
];

export function ProjectDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const {
    data: profiles,
    error: profileError,
    mutate,
  } = useSWR("profiles", api.profiles);
  const [direction, setDirection] = useState<ProductionType>("MANGA");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const available =
    profiles?.filter((profile) => profile.production_type === direction) ?? [];
  return (
    <Modal title="创建新项目" onClose={onClose} busy={busy}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setError("");
          try {
            await api.createProject({
              name: String(form.get("name")),
              synopsis: String(form.get("synopsis")),
              production_type: direction,
              profile_id: String(form.get("profile_id")),
            });
            onCreated();
          } catch (cause) {
            setError(errorMessage(cause));
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <label className="field">
            项目名称
            <input
              name="name"
              placeholder="为你的下一个故事起个名字"
              maxLength={120}
              required
              autoFocus
            />
          </label>
          <div className="field">
            <span>内容方向</span>
            <div className="direction-picker">
              {directions.map(({ type, icon: Icon, description }) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={direction === type}
                  className={`direction-option ${direction === type ? "selected" : ""}`}
                  onClick={() => setDirection(type)}
                  disabled={busy}
                >
                  <Icon size={22} />
                  <strong>{directionLabels[type]}</strong>
                  <small>{description}</small>
                </button>
              ))}
            </div>
          </div>
          {profileError ? (
            <ErrorPanel
              message={errorMessage(profileError)}
              retry={() => void mutate()}
            />
          ) : !profiles ? (
            <Loading text="加载生产配置…" />
          ) : (
            <label className="field">
              生产配置
              <select
                name="profile_id"
                key={direction}
                required
                disabled={busy}
              >
                {available.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} · v{profile.version}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            故事简介 <span className="optional">选填</span>
            <textarea
              name="synopsis"
              rows={3}
              placeholder="故事从哪里开始？主角想实现什么？"
              maxLength={10000}
            />
          </label>
          <p className="form-note">
            先建立项目与分镜。生成模型接入后，可继续生产素材。
          </p>
          {error && <ErrorPanel message={error} />}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="button primary"
            disabled={busy || available.length === 0}
          >
            {busy && <LoaderCircle size={16} className="spin" />}创建项目
          </button>
        </div>
      </form>
    </Modal>
  );
}
