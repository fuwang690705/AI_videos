// Copyright (c) 2026 AI Content Studio contributors. AGPL-3.0-or-later.
import type { components } from "../../web/src/lib/api-schema";
import type { Shot, ScriptData } from "@/types/script";
import { useProjectStore } from "@/stores/project-store";
import { useScriptStore } from "@/stores/script-store";
import { switchProject } from "@/lib/project-switcher";

export type Snapshot = components["schemas"]["CreationSnapshot"];
export type StudioShot = Shot & { studioTitle: string };

async function hydrated(store: {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (callback: () => void) => () => void;
  };
}) {
  if (store.persist.hasHydrated()) return;
  await new Promise<void>((resolve) => {
    const off = store.persist.onFinishHydration(() => {
      off();
      resolve();
    });
  });
}

export async function importSnapshot(snapshot: Snapshot): Promise<string> {
  await hydrated(useProjectStore);
  await hydrated(useScriptStore);
  const identity = { ...snapshot };
  // Optional story metadata was added to v1. Existing text-only drafts retain their identity.
  if (identity.story == null) delete identity.story;
  if (identity.media == null) delete identity.media;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(identity)),
  );
  const key = `studio-session:${Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("")}`;
  const existing = localStorage.getItem(key);
  if (
    existing &&
    useProjectStore.getState().projects.some((p) => p.id === existing)
  ) {
    await switchProject(existing);
    if (useScriptStore.getState().projects[existing]?.scriptData)
      return existing;
    throw new Error("浏览器草稿不完整，请保留数据并重新传入项目。");
  }
  const project = useProjectStore
    .getState()
    .createProject(snapshot.project.name);
  await switchProject(project.id);
  const scriptData: ScriptData = {
    title: snapshot.project.name,
    logline: snapshot.project.synopsis,
    language: "中文",
    characters: [],
    storyParagraphs: [],
    episodes: snapshot.episodes.map((ep) => ({
      id: ep.id,
      index: ep.number,
      title: ep.title,
      description: ep.synopsis,
      sceneIds: ep.scenes.map((sc) => sc.id),
    })),
    scenes: snapshot.episodes.flatMap((ep) =>
      ep.scenes.map((sc) => ({
        id: sc.id,
        name: sc.title,
        location: sc.location,
        time: "",
        atmosphere: "",
      })),
    ),
  };
  const shots: StudioShot[] = snapshot.episodes.flatMap((ep) =>
    ep.scenes.flatMap((sc) =>
      sc.shots.map((sh) => ({
        id: sh.id,
        index: sh.number,
        episodeId: ep.id,
        sceneRefId: sc.id,
        studioTitle: sh.title,
        visualDescription: sh.visual_description,
        dialogue: sh.dialogue,
        duration: sh.duration_seconds,
        actionSummary: sh.details?.action_summary ?? "",
        shotSize: sh.details?.shot_size ?? "",
        cameraMovement: sh.details?.camera_movement ?? "none",
        specialTechnique: sh.details?.special_technique ?? "none",
        characterIds: [],
        imageStatus: "idle",
        videoStatus: "idle",
      })),
    ),
  );
  const store = useScriptStore.getState();
  store.setScriptData(project.id, scriptData);
  store.setShots(project.id, shots);
  store.setParseStatus(project.id, "ready");
  store.setShotStatus(project.id, "ready");
  localStorage.setItem(key, project.id);
  return project.id;
}

export function exportSnapshot(base: Snapshot, projectId: string): Snapshot {
  const project = useScriptStore.getState().projects[projectId];
  if (!project?.scriptData) throw new Error("没有可回存的创作草稿");
  const shots = project.shots as StudioShot[];
  const retained = new Set(shots.map((shot) => shot.id));
  return {
    ...base,
    media: base.media
      ? {
          ...base.media,
          bindings: base.media.bindings.filter((binding) =>
            retained.has(binding.shot_id),
          ),
        }
      : null,
    episodes: base.episodes.map((ep) => ({
      ...ep,
      scenes: ep.scenes.map((sc) => ({
        ...sc,
        shots: shots
          .filter((sh) => sh.sceneRefId === sc.id && sh.episodeId === ep.id)
          .map((sh) => ({
            id: sh.id,
            number: sh.index,
            title: sh.studioTitle,
            visual_description: sh.visualDescription ?? "",
            dialogue: sh.dialogue ?? "",
            duration_seconds: sh.duration ?? 5,
            details: {
              action_summary: sh.actionSummary ?? "",
              shot_size: sh.shotSize ?? "",
              camera_movement: sh.cameraMovement ?? "none",
              special_technique: sh.specialTechnique ?? "none",
            },
          })),
      })),
    })),
  };
}
