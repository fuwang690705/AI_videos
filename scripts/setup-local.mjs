import { existsSync } from "node:fs";
import { root, run } from "./processes.mjs";

try {
  if (!existsSync(new URL("third_party/moyin-creator/LICENSE", root))) {
    await run("git", ["submodule", "update", "--init", "--recursive"]);
  }
  await run("npm", ["ci"]);
  await run("npm", ["ci", "--prefix", "apps/creator", "--workspaces=false"]);
  await run("uv", ["sync", "--directory", "apps/api", "--locked"]);
  await run("npm", ["run", "db:migrate"]);
  console.log(
    "安装与迁移完成。运行 npm run dev:local 启动本地工作台与创作模块。",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
