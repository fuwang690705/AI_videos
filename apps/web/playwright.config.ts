import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import os from "node:os";

// 独立临时 SQLite，避免端到端测试写入日常开发数据库。
const testDatabase = `sqlite:///${path.join(os.tmpdir(), `studio-e2e-${process.pid}.db`).replaceAll("\\", "/")}`;
const env = {
  STUDIO_DATABASE_URL: testDatabase,
  STUDIO_ENVIRONMENT: "test",
  STUDIO_MEDIA_ROOT: path.join(os.tmpdir(), `studio-e2e-media-${process.pid}`),
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm --prefix ../creator run dev -- --port 5174",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command:
        "uv run --directory ../api alembic upgrade head && uv run --directory ../api uvicorn studio.main:app --host 127.0.0.1 --port 8100",
      url: "http://127.0.0.1:8100/health/ready",
      env,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run dev -- --port 3100",
      url: "http://127.0.0.1:3100",
      env: {
        STUDIO_API_ORIGIN: "http://127.0.0.1:8100",
        NEXT_PUBLIC_STUDIO_CREATOR_ORIGIN: "http://127.0.0.1:5174",
      },
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command:
        "uv run --directory ../api python -m studio.modules.media.worker",
      wait: { stdout: /STUDIO_MEDIA_WORKER_READY/ },
      env,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
