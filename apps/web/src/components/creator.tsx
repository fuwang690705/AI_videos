"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, RefreshCw, Save } from "lucide-react";
import {
  api,
  errorMessage,
  type CreationSnapshot,
  type Project,
} from "@/lib/api";
import { ErrorPanel } from "./ui";
import {
  envelope,
  isEnvelope,
  isLocalOrigin,
  type Envelope,
} from "../../../../packages/creation/protocol";

const creatorOrigin =
  process.env.NEXT_PUBLIC_STUDIO_CREATOR_ORIGIN ?? "http://127.0.0.1:5173";
type Pending = {
  resolve: (value: Envelope) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
const subscribeOrigin = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => null;

export function Creator({ projectId }: { projectId: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const pending = useRef(new Map<string, Pending>());
  const sequence = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const parentOrigin = useSyncExternalStore(
    subscribeOrigin,
    getOrigin,
    getServerOrigin,
  );
  const frameUrl =
    parentOrigin && isLocalOrigin(creatorOrigin)
      ? `${creatorOrigin}/?parentOrigin=${encodeURIComponent(parentOrigin)}`
      : null;
  const [phase, setPhase] = useState<"connecting" | "ready" | "error">(
    "connecting",
  );
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Project>();

  useEffect(() => {
    const requests = pending.current;
    if (!isLocalOrigin(creatorOrigin)) return;
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== creatorOrigin ||
        event.source !== frame.current?.contentWindow ||
        !isEnvelope(event.data)
      )
        return;
      const request = requests.get(event.data.requestId);
      if (!request) return;
      clearTimeout(request.timer);
      requests.delete(event.data.requestId);
      if (event.data.type === "ERROR")
        request.reject(
          new Error(
            typeof event.data.payload === "string"
              ? event.data.payload
              : "创作模块操作失败",
          ),
        );
      else request.resolve(event.data);
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      for (const request of requests.values()) {
        clearTimeout(request.timer);
        request.reject(new Error("创作连接已关闭"));
      }
      requests.clear();
      sequence.current += 1;
    };
  }, []);

  useEffect(() => {
    if (phase !== "connecting") return;
    const timer = setTimeout(() => {
      setPhase("error");
      setError(
        "创作模块连接超时。请在项目根目录运行 npm run dev:local，再点击重新连接。",
      );
    }, 20_000);
    return () => clearTimeout(timer);
  }, [phase, attempt]);

  const call = (
    type: Envelope["type"],
    expected: Envelope["type"],
    payload?: unknown,
  ) => {
    const target = frame.current?.contentWindow;
    if (!target) return Promise.reject(new Error("创作窗口尚未打开"));
    const requestId = crypto.randomUUID();
    return new Promise<Envelope>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.current.delete(requestId);
        reject(
          new Error(
            "创作模块未响应，请确认 npm run dev:local 正在运行，再重新连接。浏览器草稿将保留。",
          ),
        );
      }, 12_000);
      pending.current.set(requestId, {
        timer,
        reject,
        resolve: (response) => {
          if (response.type !== expected)
            reject(new Error("创作模块协议响应不匹配，请更新后重新启动。"));
          else resolve(response);
        },
      });
      target.postMessage(envelope(type, requestId, payload), creatorOrigin);
    });
  };

  const connect = async () => {
    const current = ++sequence.current;
    try {
      const snapshot = await api.creationSnapshot(projectId);
      if (current !== sequence.current) return;
      await call("PING", "READY");
      await call("IMPORT", "LOADED", snapshot);
      if (current !== sequence.current) return;
      let copyName = `${snapshot.project.name.slice(0, 114)}·创作稿`;
      try {
        const previous = JSON.parse(
          sessionStorage.getItem(`studio-copy:${projectId}`) ?? "null",
        );
        if (typeof previous?.name === "string" && previous.name.length <= 120)
          copyName = previous.name;
      } catch {
        /* use default name */
      }
      setName(copyName);
      setError("");
      setPhase("ready");
    } catch (err) {
      if (current === sequence.current) {
        setError(errorMessage(err));
        setPhase("error");
      }
    }
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(undefined);
    try {
      const response = await call("EXPORT", "EXPORTED");
      const snapshot = response.payload as CreationSnapshot;
      if (snapshot?.schema_version !== 1)
        throw new Error("不支持的创作快照版本");
      const content = JSON.stringify({ name, snapshot });
      const key = `studio-copy:${projectId}`;
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(content),
      );
      const fingerprint = Array.from(new Uint8Array(digest), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join("");
      let previous: { fingerprint: string; requestId: string } | undefined;
      try {
        previous =
          JSON.parse(sessionStorage.getItem(key) ?? "null") ?? undefined;
      } catch {
        /* fresh save */
      }
      const requestId =
        previous?.fingerprint === fingerprint
          ? previous.requestId
          : crypto.randomUUID();
      // Preserve the save identity across a lost HTTP response or a page reload.
      sessionStorage.setItem(
        key,
        JSON.stringify({ fingerprint, requestId, name }),
      );
      const project = await api.saveCreationCopy({
        request_id: requestId,
        name,
        snapshot,
      });
      setSaved(project);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container creator-page">
      <Link className="back-link" href={`/projects/${projectId}`}>
        <ArrowLeft size={16} />
        返回原项目
      </Link>
      <section className="page-heading compact">
        <div>
          <div className="eyebrow">创作模块 / 魔因漫创</div>
          <h1>
            让镜头更有故事<span className="heading-dot">.</span>
          </h1>
          <p>编辑分镜后另存为新项目，保留原项目、设定与已绑定素材。</p>
        </div>
      </section>
      <div className="creator-toolbar">
        <label>
          副本名称
          <input
            aria-label="副本名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            disabled={phase !== "ready" || saving}
          />
        </label>
        <button
          className="button primary"
          disabled={phase !== "ready" || saving || !name.trim()}
          onClick={() => void save()}
        >
          <Save size={16} />
          {saving ? "正在回存…" : "另存回主平台"}
        </button>
        <button
          className="button secondary"
          disabled={saving}
          onClick={() => {
            sequence.current += 1;
            setError("");
            setPhase("connecting");
            setAttempt((n) => n + 1);
          }}
        >
          <RefreshCw size={16} />
          重新连接
        </button>
      </div>
      <p className="creator-scope">
        当前支持分镜文本、时长和镜头参数编辑。回存后可绑定本地图片与配音并合成样片；AI
        媒体生成尚未接入。
      </p>
      {phase === "connecting" && <p role="status">正在连接本地创作模块…</p>}
      {error && <ErrorPanel message={error} />}
      {!isLocalOrigin(creatorOrigin) && (
        <ErrorPanel message="创作模块地址须为本机 HTTP 地址，请检查 NEXT_PUBLIC_STUDIO_CREATOR_ORIGIN。" />
      )}
      {saved && (
        <div className="creator-saved" role="status">
          已回存为「{saved.name}」，原项目保留。
          <Link href={`/projects/${saved.id}`}>打开已保存副本 →</Link>
          <Link href={`/projects/${saved.id}/media`}>为此副本绑定素材 →</Link>
        </div>
      )}
      {frameUrl && (
        <iframe
          key={attempt}
          ref={frame}
          src={frameUrl}
          title="魔因创作模块"
          className="creator-frame"
          onLoad={() => void connect()}
        />
      )}
    </div>
  );
}
