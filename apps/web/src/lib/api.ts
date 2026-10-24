import type { components } from "./api-schema";

type Schemas = components["schemas"];
export type Project = Schemas["ProjectRead"];
export type ProjectPage = Schemas["ProjectPageRead"];
export type Episode = Schemas["EpisodeRead"];
export type Scene = Schemas["SceneRead"];
export type Shot = Schemas["ShotRead"];
export type Profile = Schemas["ProductionProfile"];
export type ProductionType = Schemas["ProductionType"];
export type Overview = Schemas["OverviewRead"];
export type CreationSnapshot = Schemas["CreationSnapshot"];
export type StoryDraft = Schemas["StoryRead"];

export const directionLabels: Record<ProductionType, string> = {
  MANGA: "AI 漫剧",
  MEME_ANIMATION: "沙雕动漫",
  REALISTIC: "AI 真人剧",
};

async function request<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method: body === undefined ? "GET" : method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("无法连接服务，请检查 API 是否已启动。");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.detail;
    if (typeof detail === "string") throw new Error(detail);
    if (Array.isArray(detail))
      throw new Error(
        `请检查必填字段、编号、文本长度和整数秒时长。${detail
          .slice(0, 3)
          .map(
            (item: { loc?: (string | number)[]; msg?: string }) =>
              `${item.loc?.slice(1).join(".")}: ${item.msg}`,
          )
          .join("；")}`,
      );
    throw new Error("服务暂时不可用，请检查 API 和数据库迁移。");
  }
  return data as T;
}

export const api = {
  story: (id: string) => request<StoryDraft>(`/story/projects/${id}`),
  saveStory: (id: string, data: Schemas["StoryUpdate"]) =>
    request<StoryDraft>(`/story/projects/${id}`, data, "PUT"),
  previewScript: (id: string, revision: number) =>
    request<CreationSnapshot>(`/story/projects/${id}/preview`, { revision }),
  creationSnapshot: (id: string) =>
    request<CreationSnapshot>(`/creation/projects/${id}/snapshot`),
  saveCreationCopy: (data: Schemas["CreationImport"]) =>
    request<Project>("/creation/imports", data),
  overview: () => request<Overview>("/overview"),
  profiles: () => request<Profile[]>("/production-profiles"),
  projects: (q = "", offset = 0) =>
    request<ProjectPage>(
      `/projects?${new URLSearchParams({ q, offset: String(offset), limit: "12" })}`,
    ),
  project: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (data: Schemas["ProjectCreate"]) =>
    request<Project>("/projects", data),
  episodes: (projectId: string) =>
    request<Episode[]>(`/projects/${projectId}/episodes`),
  createEpisode: (projectId: string, data: Schemas["EpisodeCreate"]) =>
    request<Episode>(`/projects/${projectId}/episodes`, data),
  scenes: (episodeId: string) =>
    request<Scene[]>(`/episodes/${episodeId}/scenes`),
  createScene: (episodeId: string, data: Schemas["SceneCreate"]) =>
    request<Scene>(`/episodes/${episodeId}/scenes`, data),
  shots: (sceneId: string) => request<Shot[]>(`/scenes/${sceneId}/shots`),
  createShot: (sceneId: string, data: Schemas["ShotCreate"]) =>
    request<Shot>(`/scenes/${sceneId}/shots`, data),
  updateShot: (id: string, data: Schemas["ShotUpdate"]) =>
    request<Shot>(`/shots/${id}`, data, "PUT"),
};

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请稍后重试。";
export const pad = (value: number) => String(value).padStart(2, "0");
