# 剧集工场 · AI Content Studio

AI 剧集内容生产平台的开发框架，面向 AI 漫剧、沙雕动漫与 AI 真人剧。

当前实现：项目 → 剧集 → 场景 → 分镜的持久化管理、生产配置绑定，以及魔因浏览器分镜编辑和项目副本回存。前端为中文制作工作台，后端提供 OpenAPI，独立 Temporal Worker 提供无模型调用的预检样例。

**当前版本为本地开发框架，尚未实现登录权限、真实模型调用、完整版本历史、媒体生产、审核和预算控制。请在本机使用，不作为生产环境部署。**

## 目录

```text
apps/
  web/                     Next.js + React + TypeScript 工作台
    src/app/               页面与全局样式
    src/components/        项目、剧集、分镜及生产配置界面
    src/lib/               API 封装与自动生成的接口类型
    e2e/                   浏览器端到端测试
  api/                     FastAPI + SQLAlchemy
    src/studio/core/       配置、数据库与 Session
    src/studio/modules/
      catalog/             项目、剧集、场景、分镜领域
      production/          Profile 注册表与 Provider 扩展契约
    src/studio/workflows/  Temporal 预检工作流与运行命令
    migrations/            Alembic 数据库迁移
    tests/                 API、迁移与预检测试
packages/contracts/        导出的 OpenAPI 契约
infra/postgres/            PostgreSQL + pgvector 初始化配置
docs/                      开发说明和实施状态
compose.yaml               可选 PostgreSQL、Temporal 开发服务
```

总体架构见 [多方向架构方案](./AI剧集内容生产平台_多方向架构方案.md)。实际完成范围见 [实施状态](./docs/implementation-status.md)。

## 云端会话交接

项目源码、前端优化和交接说明通过 Git 的 `work` 分支共享。不同云端会话的 `/workspace` 不保证互通，不需要从用户电脑上传文件。

已有项目目录时，在项目根目录执行：

```bash
git fetch origin work
git switch work
git pull --ff-only origin work
git submodule update --init --recursive
```

新环境可直接执行：

```bash
git clone --branch work --recurse-submodules https://github.com/fuwang690705/AI_videos.git
```

请先读 [交接说明](./docs/handoff.md)。`third_party/moyin-creator` 是固定版本的魔因漫创上游源码，保留其 AGPL 许可证与版权。浏览器接入复用其分镜属性组件和项目 Store；当前只接入文本编辑，不包含模型和媒体生成。详见 [接入说明与验证边界](./docs/creation-integration.md)。

## 快速启动：无需 Docker

前置条件：Node.js 22+、npm 10+、Python 3.12+、[uv](https://docs.astral.sh/uv/)。Python 版本请与依赖兼容，推荐 3.12。命令均在项目根目录执行。

1. 复制根目录 `.env.example` 为 `.env`。

   PowerShell：

   ```powershell
   Copy-Item .env.example .env
   ```

   macOS / Linux：

   ```bash
   cp .env.example .env
   ```

2. 统一安装锁定依赖并运行数据库迁移（自动补齐缺失的子模块）：

   ```bash
   npm run setup:local
   ```

3. 在项目根目录统一启动 API、工作台和魔因创作模块：

   ```bash
   npm run dev:local
   ```

4. 访问：

   - 工作台：[http://127.0.0.1:3000](http://127.0.0.1:3000)
   - API 文档：[http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
   - 数据库就绪检查：[http://127.0.0.1:8000/health/ready](http://127.0.0.1:8000/health/ready)
   - 魔因创作服务：`127.0.0.1:5173`，从工作台的项目页点击「进入魔因创作」使用。

统一启动固定使用本机 3000、8000、5173 端口，端口占用会提示退出；Ctrl+C 同时停止三个服务。无需 Docker、Temporal、GPU 或模型 API Key。

进入项目 →「进入魔因创作」→ 编辑分镜 → 填写副本名称 →「另存回主平台」。魔因右侧属性面板需先点击保存图标提交单镜头编辑，再另存整个项目。回存以新项目副本呈现，原项目保留；重复重试同一份内容不会重复创建。编辑中的草稿保存在当前浏览器，已回存的副本保存在 SQLite。

仅开发主工作台时仍可分别运行 `npm run dev:api` 和 `npm run dev`；完整接入还需 `npm run dev:creator`。

默认 SQLite 文件位于 `apps/api/.data/studio.db`，重启后数据保留。第一次打开没有预置项目，可从“新建项目”开始，再依次创建剧集、场景和分镜。

项目记录固定绑定 Profile ID 与版本；当前的分镜修订号仅用于并发编辑检查，完整历史版本与依赖追踪尚未实现。

## 使用 PostgreSQL + pgvector

安装 Docker Desktop 或 Docker Engine + Compose，然后：

```bash
docker compose up -d postgres
```

在根目录 `.env` 启用：

```dotenv
STUDIO_DATABASE_URL=postgresql+psycopg://studio:studio_local@127.0.0.1:5432/studio
```

再执行：

```bash
npm run db:migrate
npm run dev:api
```

变更后需重启 API。PostgreSQL 使用命名卷保留数据。首次创建数据库时会启用 pgvector 扩展；框架尚未实现向量索引和检索。

若设置 `POSTGRES_PASSWORD`，连接 URL 中的密码也需对应调整并进行必要的 URL 编码。这里的默认账号只用于本地开发。

切换数据库不会自动搬迁 SQLite 数据。移除 `.env` 中的数据库 URL 并重启，即可重新使用原 SQLite 文件。

## 启动 Temporal 与独立 Worker

```bash
docker compose --profile orchestration up -d
npm run dev:worker
```

Temporal UI：[http://127.0.0.1:8233](http://127.0.0.1:8233)。该服务使用 Temporal CLI 的开发服务器与持久化 SQLite，不是生产集群。

另开终端，用工作台中已有项目的 UUID 运行预检：

```bash
uv run --directory apps/api python -m studio.workflows.run_preflight 项目UUID
```

预检验证项目快照与 Profile 匹配，返回 `validated=True`、`generation_enabled=False`。它不会调用生成模型、产生媒体，也不会建立完整生产任务记录；用途是验证 Worker、队列与工作流边界。

暂停本地服务：

```bash
docker compose --profile orchestration stop
```

避免使用带 `-v` 的删除命令，除非确定要清空本地数据库和编排历史。

## 常用检查

```bash
npm run test:api
npm run check:api
npm run typecheck
npm run lint
npm run build
npm run build:creator
```

接口改变后重新生成契约：

```bash
npm run api:types
```

浏览器测试首次安装 Chromium：

```bash
npm exec --workspace @studio/web -- playwright install chromium
npm run test:e2e
```

Linux 缺少系统库时可使用 Playwright 官方的 `install --with-deps chromium` 安装方式。端到端测试自行启动 8100 端口 API 与 3100 端口前端，使用操作系统临时目录内的独立 SQLite，不写入日常开发数据。

更多说明见 [开发指南](./docs/development.md)。
