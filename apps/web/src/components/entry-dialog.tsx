"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { api, errorMessage, type Shot } from "@/lib/api";
import { ErrorPanel, Modal } from "./ui";

export function EntryDialog({
  kind,
  parentId,
  nextNumber,
  onClose,
  onCreated,
}: {
  kind: "episode" | "scene";
  parentId: string;
  nextNumber: number;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const noun = kind === "episode" ? "剧集" : "场景";
  return (
    <Modal title={`新建${noun}`} onClose={onClose} busy={busy}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setError("");
          const common = {
            number: Number(form.get("number")),
            title: String(form.get("title")),
          };
          try {
            const record =
              kind === "episode"
                ? await api.createEpisode(parentId, {
                    ...common,
                    synopsis: String(form.get("synopsis")),
                  })
                : await api.createScene(parentId, {
                    ...common,
                    location: String(form.get("location")),
                  });
            onCreated(record.id);
          } catch (cause) {
            setError(errorMessage(cause));
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <label className="field">
            {noun}标题
            <input name="title" maxLength={120} required autoFocus />
          </label>
          <label className="field">
            编号
            <input
              type="number"
              name="number"
              min={1}
              max={100000}
              defaultValue={nextNumber}
              required
            />
          </label>
          {kind === "episode" ? (
            <label className="field">
              本集梗概
              <textarea name="synopsis" maxLength={10000} rows={4} />
            </label>
          ) : (
            <label className="field">
              地点
              <input
                name="location"
                placeholder="例如：城市天台 · 夜"
                maxLength={200}
              />
            </label>
          )}
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
          <button className="button primary" disabled={busy}>
            {busy && <LoaderCircle size={16} className="spin" />}创建{noun}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ShotDialog({
  sceneId,
  nextNumber,
  shot,
  onClose,
  onSaved,
}: {
  sceneId: string;
  nextNumber: number;
  shot?: Shot;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title={shot ? "编辑分镜" : "新建分镜"} onClose={onClose} busy={busy}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setBusy(true);
          setError("");
          const content = {
            title: String(form.get("title")),
            visual_description: String(form.get("visual_description")),
            dialogue: String(form.get("dialogue")),
            duration_seconds: Number(form.get("duration_seconds")),
          };
          try {
            if (shot)
              await api.updateShot(shot.id, {
                ...content,
                revision: shot.revision,
              });
            else
              await api.createShot(sceneId, {
                ...content,
                number: Number(form.get("number")),
              });
            onSaved();
          } catch (cause) {
            setError(errorMessage(cause));
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <label className="field">
            镜头标题
            <input
              name="title"
              defaultValue={shot?.title}
              maxLength={120}
              required
              autoFocus
            />
          </label>
          <div className="field-row">
            <label className="field">
              镜头编号
              <input
                type="number"
                name="number"
                min={1}
                max={100000}
                defaultValue={shot?.number ?? nextNumber}
                disabled={!!shot}
                required
              />
            </label>
            <label className="field">
              目标时长（秒）
              <input
                type="number"
                name="duration_seconds"
                min={1}
                max={120}
                defaultValue={shot?.duration_seconds ?? 5}
                required
              />
            </label>
          </div>
          <label className="field">
            画面描述
            <textarea
              name="visual_description"
              defaultValue={shot?.visual_description}
              rows={4}
              maxLength={10000}
              placeholder="人物、景别、动作和镜头意图…"
            />
          </label>
          <label className="field">
            对白
            <textarea
              name="dialogue"
              defaultValue={shot?.dialogue}
              rows={3}
              maxLength={10000}
              placeholder="说话人及台词，可暂时留空"
            />
          </label>
          {shot && (
            <p className="form-note">
              当前草稿修订 r{shot.revision}。保存时会检查是否存在并发修改。
            </p>
          )}
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
          <button className="button primary" disabled={busy}>
            {busy && <LoaderCircle size={16} className="spin" />}
            {shot ? "保存分镜" : "创建分镜"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
