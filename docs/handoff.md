# 对话交接：剧集工场与 Moyin Creator 集成

初次核对日期：2026-10-21（北京时间）。后续已补充 Git 云端交接方式。本文记录实际进度；集成设计不等于已实现功能。

## 用户目标与已确定偏好

- 项目是内部使用的 AI 剧集内容生产平台，覆盖 AI 漫剧、沙雕动漫、AI 真人剧。
- 用户要求前端年轻、轻快、好看；已采用浅色工作台、青柠绿与淡紫色。
- 用户最初提过 Vite + Vue2 + Element UI，随后补充已有项目是 Next.js + React + FastAPI，并要求以 README 和架构文档为准继续。现有实现沿用 Next.js，未另起 Vue 工程。
- 最新开发目标：将 https://github.com/MemeCalculate/moyin-creator.git 与已有规划结合，实现可运行的集成。用户已多次要求继续推进。
- 已决定先在自己的电脑本地运行，暂不采购或部署云服务器。不要将云端 localhost 说成用户电脑上的服务。
- 用户要求交接到另一个云端对话，已明确不能依赖用户电脑上的本地文件；源码与文档应通过 Git 远程获取。

## 代码位置与持久化注意事项

- 主项目：`/workspace/AI_videos`。
- Git 远程：`https://github.com/fuwang690705/AI_videos.git`。
- 当前分支：`work`。初始框架提交为 `36fddaa949399f879e9d52c79b4c46f1723eac40`；前端更新、本文和上游子模块均在后续云端交接提交中维护。请拉取最新 `origin/work`，以 `git log -1` 确认当前版本。
- 云端不同会话的 `/workspace` 不保证互通。本次已改用 Git 交接；优先按下方命令从远程获取源码，无需从用户电脑上传文件。
- 主仓库通过 `.gitmodules` 登记 `third_party/moyin-creator`，固定上游版本并保留原许可证。拉取主仓库后必须初始化子模块。
- 不要用 reset/clean 等操作丢失接手会话已有的改动；如果无法快进，先检查分支和差异再合并。
- 旧源码包 `/workspace/AI_content_studio_local.zip` 包含前端更新，但生成于 Moyin 调研之前，不包含上游源码和本交接文档。
- 此前生成 `/workspace/AI_content_studio_handoff.zip`：包含当时的 `AI_videos/` 源码和 `moyin-creator/` 上游源码。该压缩包是旧快照，且不会自动跨会话共享，不作为后续云端交接的前置条件。
- 源码包不含 `.git`、真实 `.env`、依赖目录、SQLite 数据库、缓存或密钥。解压后需重新安装依赖。

已有仓库的云端会话，在仓库根目录执行：

```bash
git fetch origin work
git switch work
git pull --ff-only origin work
git submodule update --init --recursive
```

没有仓库的新会话执行：

```bash
git clone --branch work --recurse-submodules https://github.com/fuwang690705/AI_videos.git
cd AI_videos
```

确认 `docs/handoff.md`、`apps/web/src/components/creation-hero.tsx`、`third_party/moyin-creator/LICENSE` 均存在，再继续开发。

## 必须先读的文件

主项目根目录的 `README.md`、`AI剧集内容生产平台_多方向架构方案.md`，以及 `docs/development.md`、`docs/implementation-status.md`、`apps/web/AGENTS.md`。

`apps/web/AGENTS.md` 要求：修改 Next.js 代码前，先阅读安装后的 `node_modules/next/dist/docs/` 中相关文档。本项目使用的版本与旧版 Next.js 有差异。

## 主项目技术栈与实际范围

- npm workspace monorepo；Node.js >=22、npm >=10。
- 前端：`apps/web`，Next.js 16.4.2、React / React DOM 19.3.1、TypeScript 5.9.3、SWR、lucide-react。
- 后端：`apps/api`，Python（推荐 3.12）、uv、FastAPI、SQLAlchemy、Alembic。
- 默认 SQLite：`apps/api/.data/studio.db`；可选 PostgreSQL + pgvector。
- 可选 Temporal 开发服务与独立 Worker；目前只提供无模型调用的预检样例，不是完整生产任务系统。
- 浏览器请求同源 `/api/v1`，Next.js 通过 `STUDIO_API_ORIGIN` 转发到 FastAPI。密钥不应打包进前端。

已经实现：项目、剧集、场景、分镜的创建和持久化，项目搜索与分页，分镜编辑的 revision 并发检查，三种只读版本化生产 Profile 绑定，数据库迁移，接口契约生成，基础 API 与浏览器测试。

尚未实现：真实 AI 模型调用、媒体生产、角色/资产版本管理、完整历史版本、持久化生产任务、预算控制、质检审核、成片导出、登录权限和正式部署配置。不要将规划中的能力报告为已完成。

长期规划是故事层共用、生产层按方向分叉，包括 Story Bible、资产、Provider Adapter、任务编排、音画同步、质量审核、成本预算与交付。优先先跑通一条实际生产线；规模化能力须经过试制和压测，不能只依据项目/剧集记录数量判断。

## 本会话已完成的前端改动

已修改：

```text
apps/web/src/app/globals.css
apps/web/src/components/dashboard.tsx
apps/web/src/components/project-dialog.tsx
apps/web/src/components/settings.tsx
apps/web/src/components/shell.tsx
apps/web/e2e/studio.spec.ts
docs/implementation-status.md
```

新增 `apps/web/src/components/creation-hero.tsx`。

- 浅色侧栏、青柠主按钮、淡紫创作引导区与 CSS 插画。
- 首页三个快捷入口：AI 漫剧、沙雕动漫、AI 真人剧，点击后在创建弹窗中选中对应内容方向与 Profile。
- 统一项目卡片、工作台、弹窗、配置页样式，改善字体、圆角和留白。
- 图标导航补充无障碍名称与当前页状态。
- 保留真实 API 数据、加载/空/错误状态，不使用虚构统计或生成结果。
- 手机首页标题和快捷入口已调整；320/390/768px 下验证无横向溢出。

前端更新时实际通过：TypeScript、ESLint、Next.js 生产构建，以及 Chromium 端到端测试 3 项（目录创建与分镜持久化；生产配置；快捷方向创建、搜索与窄屏布局）。这是上次执行结果，不代表 Moyin 集成已验证。

预览文件在 `/workspace/scratch/studio-preview/`：`dashboard-desktop.png`、`dashboard-mobile.png`、`settings-desktop.png`。云端文件可能不会跨会话保留。

## Moyin Creator 调研：已完成，尚未开始集成编码

- 上游 URL：`https://github.com/MemeCalculate/moyin-creator.git`。
- 已登记到主仓库子模块 `third_party/moyin-creator`，初始化子模块后可跨会话恢复。原调研副本 `/workspace/scratch/moyin-upstream` 仅是本会话临时目录。
- 已检查固定提交：`7e5c5655de94d49885e13c369f0a71212893a0aa`。
- 上游 package.json 版本：0.2.3。README 中部分下载版本与包版本不同，选型以实际源码为准。
- 技术栈：Electron 30、React 18、TypeScript、Vite / electron-vite、Zustand 5、Radix UI、Tailwind CSS 4。
- 上游包含剧本解析、角色、场景、导演、S 级视频创作、媒体、时间线与导出等界面和逻辑。真实生成需要用户配置服务商 API Key；本会话没有配置或调用付费服务。
- 许可证：package.json 为 `AGPL-3.0-or-later`，仓库保留 `LICENSE`、`COMMERCIAL_LICENSE.md`、版权声明。需遵循适用的源码提供及分发要求；如需闭源集成/分发，应核实商业许可。未替用户变更整个主项目的许可，也没有联系作者或购买许可。

**实际完成程度：已完成源码调研，并将固定版本登记为 Git 子模块。尚未安装上游依赖或实现创作功能集成，也没有完成浏览器适配、桥接接口、导入导出、集成测试或一键启动命令。子模块同步不等于业务集成已完成。**

### 已定位的上游文件与接口

```text
src/App.tsx                          启动迁移、主题与自动模型元数据同步
src/main.tsx                         React 入口，IPC 使用有 Electron 条件判断
src/components/Layout.tsx            项目/剧本/角色/场景/导演等布局
src/components/TabBar.tsx             导航
src/components/ProjectHeader.tsx      当前项目与保存提示
src/stores/project-store.ts          项目列表、createProject、setActiveProject
src/stores/script-store.ts           项目原文、结构化剧本、shots 及修改操作
src/stores/media-panel-store.ts      activeTab、inProject、剧集作用域
src/lib/project-switcher.ts          switchProject：协调多个 store 的切换和 rehydrate
src/lib/project-storage.ts           按项目路由 Zustand 持久化
src/lib/indexed-db-storage.ts        Electron 文件存储，浏览器回退 localStorage
src/lib/storage-migration.ts         迁移/恢复，主要逻辑依赖 window.fileStorage
src/lib/cors-fetch.ts                DEV 下走 /__api_proxy，生产模式直接 fetch
src/lib/script/export-service.ts     manifest.json 及图片/视频导出，有浏览器回退
src/types/script.ts                  ScriptData / Episode / ScriptScene / Shot
vite.config.ts                      包含 Electron 插件和通用 API CORS 代理
electron.vite.config.ts              桌面构建配置
```

注意：上游默认 `npm run dev` 启动 Electron，不是普通纯 Web Vite。`npm run build` 带桌面打包流程与 PowerShell prebuild；不能直接假定在当前 Linux 环境或主项目中可用。需单独验证 Web 入口和依赖。上游 React 18 与主项目 React 19 应隔离，避免混装 React。不要直接把带任意 URL 的代理暴露到公网。

上游主要数据结构：

- `ScriptData`：`title`、`genre?`、`logline?`、`language`、`targetDuration?`、`characters[]`、`scenes[]`、`episodes[]`、`storyParagraphs[]`。
- `Episode`：`id`、`index`、`title`、`description?`、`sceneIds[]`。
- `ScriptScene`：`id`、`name?`、`location`、`time`、`atmosphere`，另有提示词/多视角等扩展字段。
- `Shot`：`id`、`index`、`episodeId?`、`sceneRefId`、`actionSummary`、`visualDescription?`、`dialogue?`、`duration?`，另有角色、镜头参数、提示词、媒体 URL、生成状态等。
- `ScriptProjectData`：包含 `rawScript`、`scriptData`、`shots`、`episodeRawScripts`、`projectBackground` 等。
- 项目切换应使用 `switchProject()`，不要直接改 activeProjectId：上游明确说明错误的 rehydrate 顺序可能覆盖已有持久化数据。

## 集成方向与下一步（设计建议，尚未实现）

已经向用户说明的方向：让 Moyin 作为独立创作工具与已有工作台协作，提供项目传入、分镜文本回存和统一本地启动。保留主平台的项目管理与长期生产规划，复用上游创作能力。

可从以下顺序推进，依据实际运行结果调整：

1. 先验证固定版本的 Moyin 能否作为独立本地 Web 模块运行；保留来源、许可证和版本信息。评估浏览器存储、媒体访问、CORS、导出和 Electron 专属功能的兼容边界。
2. 在现有工作台增加可用入口。两个 React 版本独立构建/运行；独立窗口或 iframe 均是待验证实现选择，不能仅嵌入一个链接就声称完成集成。
3. 定义版本化项目快照：主项目 → 剧集 → 场景 → 分镜，与 Moyin 的 ScriptData / shots 适配。
4. FastAPI 提供项目快照导出与原子导入。建议导入为新项目副本，明确数据范围，避免覆盖已有记录。所有长度、编号、时长、关联关系由后端验证，失败回滚。
5. 若使用 postMessage 桥接，核验 origin、source、协议版本和请求标识，设置超时/错误反馈，不在消息中传递 API Key。
6. 处理原模型差异：主项目分镜时长为 1～120 的整数秒、标题不超过 120 字符、描述/对白不超过 10000 字符。上游有小数时长及更丰富字段，需要明确转换和保留策略，不能静默丢弃。
7. 主项目暂不支持角色、媒体和生产元数据；确定如何保留，或明确说明这些内容仍在 Moyin 独立存储。媒体生成、项目中心的 Profile 与上游模型配置是不同概念，不要将 generation_enabled 全部改为 true。
8. 增加本地统一安装/启动说明，验证真实双向数据流、错误处理与已有流程回归，然后更新实施状态和源码包。

建议验收：从主平台建立含剧集、场景、分镜的项目，传入 Moyin 后能正确展示/编辑；编辑后的分镜可另存回主平台并刷新后保留；原项目仍完好；服务未启动时有可操作错误提示；不依赖付费 API 也能测试目录与文本桥接。若模型生成未实际验证，应如实说明。

## 本地运行（主项目，现有功能）

安装 Node.js >=22、npm >=10、Python 3.12、uv。在主项目根目录将 `.env.example` 复制为 `.env` 后执行：

```bash
npm ci
uv sync --directory apps/api --locked
npm run db:migrate
```

两个终端分别运行：

```bash
npm run dev:api
```

```bash
npm run dev
```

工作台 `http://127.0.0.1:3000`，API 文档 `http://127.0.0.1:8000/docs`，就绪检查 `http://127.0.0.1:8000/health/ready`。

无需 Docker 或 PostgreSQL 即可运行当前目录管理功能；Temporal 不是此流程的前置条件。本会话未证实用户已经在自己电脑上成功启动。

检查命令：

```bash
npm run typecheck
npm run lint
npm run build
npm run test:api
npm run check:api
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

最后一行是当前 Linux 云端的浏览器配置；用户电脑需要按 README 安装 Playwright Chromium，不要照抄 `/usr/bin/chromium` 到 Windows。E2E 使用独立临时 SQLite 和 8100/3100 端口，不应写入日常数据库。接口改变后执行 `npm run api:types`，不要手工编辑生成的 api-schema.ts。

## 给下一对话的简短指令

> 请继续开发剧集工场。先拉取 origin/work 并初始化 third_party/moyin-creator 子模块，阅读 docs/handoff.md、README 和架构文档，保留已完成的前端优化。现有技术栈是 Next.js + React + FastAPI，运行目标仍是用户本机，开发交接通过 Git 云端进行。我要把 MemeCalculate/moyin-creator 与自己的多方向 AI 剧集生产规划结合起来。上一个对话只完成上游调研和源码登记，尚未实现业务集成。请实际跑通集成和数据流，保留许可证与来源，不要重复搭建 Vue 框架，也不要把未测试的模型能力说成已经可用。
