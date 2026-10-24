import net from "node:net";
import { spawn } from "node:child_process";
import { run, start } from "./processes.mjs";

const children = [];
let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    if (process.platform === "win32")
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* already exited */
      }
    }
  }
  process.exitCode = code;
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

try {
  for (const port of [3000, 8000, 5173]) {
    await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once("error", () =>
        reject(new Error(`本机端口 ${port} 已被占用，请先关闭旧服务。`)),
      );
      server.listen(port, "127.0.0.1", () => server.close(resolve));
    });
  }
  await run("npm", ["run", "db:migrate"]);
  if (!stopping) {
    const commands = [
      [
        "API",
        "uv",
        [
          "run",
          "--directory",
          "apps/api",
          "uvicorn",
          "studio.main:app",
          "--host",
          "127.0.0.1",
          "--port",
          "8000",
        ],
      ],
      ["工作台", "npm", ["run", "dev"]],
      ["创作模块", "npm", ["--prefix", "apps/creator", "run", "dev"]],
    ];
    for (const [label, command, args] of commands) {
      const child = start(command, args, {
        detached: process.platform !== "win32",
        env: {
          ...process.env,
          STUDIO_API_ORIGIN: "http://127.0.0.1:8000",
          NEXT_PUBLIC_STUDIO_CREATOR_ORIGIN: "http://127.0.0.1:5173",
        },
      });
      children.push(child);
      child.on("error", (error) => {
        console.error(`${label} 启动失败：${error.message}`);
        shutdown(1);
      });
      child.on("exit", (code) => {
        if (!stopping) {
          console.error(`${label} 已退出（${code}），停止其他本地服务。`);
          shutdown(code || 1);
        }
      });
    }
    console.log(
      "本地工作台：http://127.0.0.1:3000 · API：8000 · 创作模块：5173。Ctrl+C 停止全部服务。",
    );
  }
} catch (error) {
  console.error(error.message);
  shutdown(1);
}
