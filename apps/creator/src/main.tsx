// Copyright (c) 2026 AI Content Studio contributors. AGPL-3.0-or-later.
// Uses unmodified Moyin Creator components, Copyright (c) 2025 hotflow2024.
import React, { useState, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { PropertyPanel } from "@/components/panels/script/property-panel";
import { useScriptStore } from "@/stores/script-store";
import {
  importSnapshot,
  exportSnapshot,
  type Snapshot,
  type StudioShot,
} from "./adapter";
import {
  envelope,
  isEnvelope,
  isLocalOrigin,
  type Envelope,
} from "../../../packages/creation/protocol";
import "./styles.css";

const requestedOrigin =
  new URLSearchParams(location.search).get("parentOrigin") ?? "";
const parentOrigin = isLocalOrigin(requestedOrigin) ? requestedOrigin : null;
let active: { base: Snapshot; projectId: string } | null = null;
let loading = false;
const replyCache = new Map<string, Envelope>();
const notify = (message: Envelope) => {
  if (parentOrigin) window.parent.postMessage(message, parentOrigin);
};

window.addEventListener("message", async (event) => {
  if (
    !parentOrigin ||
    event.origin !== parentOrigin ||
    event.source !== window.parent ||
    !isEnvelope(event.data)
  )
    return;
  const message = event.data;
  if (replyCache.has(message.requestId)) {
    notify(replyCache.get(message.requestId)!);
    return;
  }
  let response: Envelope;
  try {
    switch (message.type) {
      case "PING":
        response = envelope("READY", message.requestId);
        break;
      case "IMPORT": {
        if (loading) throw new Error("正在打开草稿，请稍后重试");
        const base = message.payload as Snapshot;
        if (
          base?.schema_version !== 1 ||
          !base.project ||
          !Array.isArray(base.episodes)
        )
          throw new Error("不支持的项目快照版本");
        loading = true;
        try {
          const projectId = await importSnapshot(base);
          active = { base, projectId };
          window.dispatchEvent(new Event("studio-loaded"));
          response = envelope("LOADED", message.requestId);
        } finally {
          loading = false;
        }
        break;
      }
      case "EXPORT":
        if (loading || !active) throw new Error("请先传入项目");
        if (document.querySelector(".upstream-shot-panel textarea"))
          throw new Error(
            "请先保存或取消魔因属性面板中的单镜头编辑，再另存项目。",
          );
        response = envelope(
          "EXPORTED",
          message.requestId,
          exportSnapshot(active.base, active.projectId),
        );
        break;
      default:
        return;
    }
  } catch (error) {
    response = envelope(
      "ERROR",
      message.requestId,
      error instanceof Error ? error.message : "创作模块操作失败",
    );
  }
  if (replyCache.size > 30) replyCache.delete(replyCache.keys().next().value!);
  replyCache.set(message.requestId, response);
  notify(response);
});

class EditorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="alert">
        创作界面加载失败，请返回工作台重试。已回存的项目不受影响。
      </p>
    ) : (
      this.props.children
    );
  }
}

function Editor({ base, projectId }: { base: Snapshot; projectId: string }) {
  const project = useScriptStore((state) => state.projects[projectId]);
  const [selectedId, setSelectedId] = useState<string | null>(
    project.shots[0]?.id ?? null,
  );
  const [message, setMessage] = useState("");
  const shots = project.shots as StudioShot[];
  const selected = shots.find((sh) => sh.id === selectedId);
  const update = (id: string, changes: Partial<StudioShot>) =>
    useScriptStore.getState().updateShot(projectId, id, changes);
  const select = (id: string) => {
    if (document.querySelector(".upstream-shot-panel textarea")) {
      setMessage("请先保存或取消右侧的单镜头编辑。");
      return;
    }
    setMessage("");
    setSelectedId(id);
  };
  return (
    <>
      <header className="creator-heading">
        <div>
          <small>魔因漫创 · 浏览器文本创作</small>
          <h1>{base.project.name}</h1>
        </div>
        <p>草稿保存在此浏览器。完成编辑后，在上方另存回剧集工场。</p>
      </header>
      {message && (
        <p role="alert" className="creator-alert">
          {message}
        </p>
      )}
      <div className="creator-grid">
        <nav aria-label="创作分镜" className="creator-tree">
          {base.episodes.length === 0 && (
            <p>项目还没有剧集，请返回工作台创建。</p>
          )}
          {base.episodes.map((ep) => (
            <section key={ep.id}>
              <h2>
                EP{ep.number} · {ep.title}
              </h2>
              {ep.scenes.length === 0 && <p>本集还没有场景</p>}
              {ep.scenes.map((sc) => (
                <div key={sc.id} className="creator-scene">
                  <h3>
                    SC{sc.number} · {sc.title}
                  </h3>
                  <p>{sc.location}</p>
                  {shots
                    .filter((sh) => sh.sceneRefId === sc.id)
                    .map((sh) => (
                      <button
                        key={sh.id}
                        type="button"
                        aria-current={sh.id === selectedId ? "true" : undefined}
                        onClick={() => select(sh.id)}
                      >
                        {sh.index}. {sh.studioTitle || "未命名镜头"}{" "}
                        <small>{sh.duration}s</small>
                      </button>
                    ))}
                  <button
                    type="button"
                    className="add-shot"
                    onClick={() => {
                      if (
                        document.querySelector(".upstream-shot-panel textarea")
                      ) {
                        setMessage("请先保存或取消右侧的单镜头编辑。");
                        return;
                      }
                      const id = crypto.randomUUID();
                      useScriptStore.getState().setShots(projectId, [
                        ...shots,
                        {
                          id,
                          index:
                            Math.max(
                              0,
                              ...shots
                                .filter((sh) => sh.sceneRefId === sc.id)
                                .map((sh) => sh.index),
                            ) + 1,
                          episodeId: ep.id,
                          sceneRefId: sc.id,
                          studioTitle: "新镜头",
                          actionSummary: "",
                          characterIds: [],
                          duration: 5,
                          imageStatus: "idle",
                          videoStatus: "idle",
                        } as StudioShot,
                      ]);
                      setSelectedId(id);
                    }}
                  >
                    ＋ 添加分镜
                  </button>
                </div>
              ))}
            </section>
          ))}
        </nav>
        {selected ? (
          <>
            <section className="creator-fields" aria-label="分镜基础信息">
              <h2>分镜基础信息</h2>
              <label>
                分镜标题
                <input
                  aria-label="分镜标题"
                  maxLength={120}
                  value={selected.studioTitle}
                  onChange={(e) =>
                    update(selected.id, { studioTitle: e.target.value })
                  }
                />
              </label>
              <label>
                画面描述
                <textarea
                  aria-label="画面描述"
                  maxLength={10000}
                  rows={9}
                  value={selected.visualDescription ?? ""}
                  onChange={(e) =>
                    update(selected.id, { visualDescription: e.target.value })
                  }
                />
              </label>
              <label>
                时长（整数秒，1–120）
                <input
                  aria-label="时长"
                  type="number"
                  min={1}
                  max={120}
                  step={1}
                  value={
                    Number.isFinite(selected.duration) ? selected.duration : ""
                  }
                  onChange={(e) =>
                    update(selected.id, {
                      duration:
                        e.target.value === "" ? NaN : Number(e.target.value),
                    })
                  }
                />
              </label>
              <p>
                动作、对白、景别和镜头运动在右侧编辑。点击铅笔进入编辑，点击保存图标提交单镜头修改。
              </p>
              <p>
                当前模块只接入文本创作；未接入模型、媒体生成、资产库及成片导出。
              </p>
            </section>
            <section className="upstream-shot-panel" aria-label="魔因镜头属性">
              <PropertyPanel
                key={selected.id}
                selectedItemId={selected.id}
                selectedItemType="shot"
                shot={selected}
                onUpdateShot={(id, updates) => update(id, updates)}
                onDeleteShot={(id) => {
                  useScriptStore.getState().setShots(
                    projectId,
                    shots.filter((sh) => sh.id !== id),
                  );
                  setSelectedId(null);
                }}
              />
            </section>
          </>
        ) : (
          <p className="creator-fields">选择一个分镜，或在场景下添加分镜。</p>
        )}
      </div>
      <footer className="creator-footer">
        魔因漫创 © 2025 hotflow2024 · AGPL-3.0-or-later ·{" "}
        <a
          href="https://github.com/MemeCalculate/moyin-creator/tree/7e5c5655de94d49885e13c369f0a71212893a0aa"
          target="_blank"
          rel="noreferrer"
        >
          固定版本源码与许可
        </a>
      </footer>
    </>
  );
}

function App() {
  const [session, setSession] = useState(active);
  const [storageError, setStorageError] = useState(false);
  React.useEffect(() => {
    const loaded = () => setSession(active);
    const failed = () => setStorageError(true);
    window.addEventListener("studio-loaded", loaded);
    window.addEventListener("unhandledrejection", failed);
    return () => {
      window.removeEventListener("studio-loaded", loaded);
      window.removeEventListener("unhandledrejection", failed);
    };
  }, []);
  return (
    <EditorBoundary>
      {storageError && (
        <p className="creator-alert" role="alert">
          浏览器草稿存储失败，请立即另存回主平台，避免关闭后丢失。
        </p>
      )}
      {session ? (
        <Editor key={session.projectId} {...session} />
      ) : (
        <p className="creator-wait">请从剧集工场的项目工作台打开创作模块。</p>
      )}
    </EditorBoundary>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
