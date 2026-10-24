import { spawn } from "node:child_process";

export const root = new URL("../", import.meta.url);
export function start(command, args, options = {}) {
  return spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
}
export function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = start(command, args);
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} 退出，状态 ${code}`)),
    );
  });
}
