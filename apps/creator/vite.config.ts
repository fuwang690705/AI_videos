import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const upstream = path.resolve(here, "../../third_party/moyin-creator/src");
const modules = path.resolve(here, "node_modules");

export default defineConfig({
  plugins: [
    {
      name: "browser-property-panel",
      enforce: "pre",
      transform(code, id) {
        if (
          id.split("?")[0] !==
          path.join(upstream, "components/panels/script/property-panel.tsx")
        )
          return;
        const directorAction = "onClick={() => onGoToDirector?.(shot.id)}";
        if (!code.includes(directorAction))
          throw new Error("上游分镜面板已变化，请重新核对浏览器适配");
        return {
          code: code
            .replace(directorAction, 'disabled title="媒体生成尚未接入"')
            .replaceAll("去AI导演生成", "媒体生成尚未接入")
            .replaceAll(
              "onClick={startEditing}",
              'aria-label="编辑镜头属性" onClick={startEditing}',
            )
            .replaceAll(
              "onClick={handleSave}",
              'aria-label="保存镜头属性" onClick={handleSave}',
            )
            .replaceAll(
              "onClick={() => setIsEditing(false)}",
              'aria-label="取消镜头编辑" onClick={() => setIsEditing(false)}',
            ),
          map: null,
        };
      },
    },
    {
      name: "isolated-upstream-dependencies",
      enforce: "pre",
      async resolveId(source, importer) {
        if (
          importer?.startsWith(upstream) &&
          !source.startsWith(".") &&
          !source.startsWith("/") &&
          !source.startsWith("@/") &&
          !source.startsWith("@opencut/")
        ) {
          // Resolve as an import FROM this app so package conditional exports remain intact.
          return this.resolve(source, path.join(here, "src/main.tsx"), {
            skipSelf: true,
          });
        }
      },
    },
    react(),
  ],
  resolve: {
    // Resolve ALL bare imports through this app, including imports in upstream sources.
    // Never resolve upstream React to the main workspace's React 19 installation.
    alias: [
      {
        find: "@/lib/indexed-db-storage",
        replacement: path.resolve(here, "src/storage.ts"),
      },
      { find: "@", replacement: upstream },
      {
        find: "@opencut/ai-core",
        replacement: path.join(upstream, "packages/ai-core"),
      },
      { find: "tailwindcss", replacement: path.join(modules, "tailwindcss") },
    ],
    dedupe: ["react", "react-dom", "zustand"],
  },
  css: { postcss: path.resolve(here) },
  server: {
    host: "127.0.0.1",
    strictPort: true,
    fs: { allow: [path.resolve(here, "../..")] },
    // No arbitrary-URL CORS proxy or Electron plugins.
  },
  preview: { host: "127.0.0.1", strictPort: true },
});
