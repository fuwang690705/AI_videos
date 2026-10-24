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

尚未实现：真实 AI 模型调用与 AI 媒体生成、角色/资产版本管理、完整历史版本、完整 AI 生产任务编排、预算控制、语义质检、登录权限和正式部署配置。本地素材、渲染任务、样片确认和导出已在后续迭代实现，见下方；不要把本地合成等同于 AI 自动出片。

### 最新继续开发：本地素材到分镜样片

- 项目页「素材与样片」沿用原 UI，可上传 PNG/JPEG/WebP 和 WAV/MP3，检查内容、尺寸、解码与实际配音时长，记录来源与摘要。
- 逐镜头绑定图片及可选配音，使用 revision 并发保护，拒绝跨项目误绑。配音超过镜头会在预检中拒绝，不自动截断。
- 迁移 `0004_media` 新增素材、镜头绑定、持久化渲染任务和人工确认记录。已有目录、故事和创作导入表保留。
- 独立本地 Worker 按锁定输入调用真实 FFmpeg，生成 H.264/AAC MP4、SRT、VTT、制作清单；支持 1280×720 / 720×1280、24 fps，最多 300 秒/100 镜头。
- 原子领取、心跳、超时和中断恢复，失败不交付部分样片。默认单 Worker 串行；没有启用 Temporal 的 AI 生产编排或预算系统。
- 浏览器实际播放视频、加载字幕、人工确认/退回、下载；每次确认附着于确切样片，旧样片不受新分镜编辑影响。
- 魔因创作副本保留已绑定素材引用，复制项目级元数据并复用不可变本地文件，不复制旧任务或旧确认结论。兼容旧快照和此前版本的幂等请求指纹。
- `npm run dev:local` 现在启动 API、Next.js、魔因、本地渲染 Worker 四个进程；独立 Worker 命令 `npm run dev:render`。FFmpeg/ffprobe 需本机安装，缺失时文本创作仍可用。
- 默认文件位于 `apps/api/.data/media`（`STUDIO_MEDIA_ROOT` 可配置），备份必须同时包含数据库与媒体文件。原始音频会解码规范化为 WAV，原字节不保留，但记录源摘要。
- 46 项 SQLite 后端测试、10 项 Chromium 浏览器测试通过；主工作台类型/Lint/构建与创作包构建通过。实际四进程启动、重启后视频摘要、素材、确认记录和旧项目保留已验证。
- 此处输出是静态图片和已有配音组成的分镜样片，不是 AI 生成视频、角色动画、口型、TTS 或完整剪辑成片。当前没有服务商/模型/Key 配置，用户尚未提供这些信息。
- 详细运行、数据与限制见 [本地素材与样片](./local-media.md)。当前所有 `generation_enabled` 仍为 false，上游固定版本和许可证未改动。

### 上一轮：故事工作台与 UI 统一

- 项目页新增「故事与设定」：粘贴或导入 UTF-8 TXT/Markdown，保存原文、大纲、世界观、人物与连续性约束；草稿持久化并检查 revision 冲突。
- 按明确模板预览已有结构化剧本，人工确认后另存为分镜项目，随后进入魔因继续编辑。原文和设定会随每次创作副本回存，不丢失。
- 迁移已推进至 `0003_story`，在原有目录和创作导入表之外新增故事草稿表；统一启动会迁移到最新版。
- 创作快照版本 1 新增可选 `story` 字段，兼容旧快照；空 story 在浏览器草稿摘要中省略，保留早先未回存草稿的恢复标识。
- `packages/theme/studio.css` 提供主工作台与魔因编辑区共用主题，保持原来的浅色、青柠、淡紫、字体与表单风格；保存、编辑、取消操作有文字。
- SQLite 后端测试 35 项、Chromium 浏览器测试 8 项通过；主工作台类型检查、Lint、Next.js 构建和创作包 Vite 构建通过。
- 结构化剧本导入是规则解析，没有调用模型，不会从普通小说补写情节；自由文本只能先保存。故事设定仍是工作草稿，没有批准、历史版本或正式剧情事实系统。
- 当前云环境没有配置模型服务商或密钥。已向用户询问文本/图片/视频/配音服务商与准确模型名，尚待答复；不要在聊天索取密钥。继续开发应先确认具体服务，再做真实 Adapter、任务与预算边界及受控验证，不能声明生成已经可用。
- 详情见 [故事工作台说明](./story-workspace.md)，本机仍使用 `npm run setup:local` 与 `npm run dev:local`。

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

## Moyin Creator：当前已实现的文本创作接入

上游固定提交仍为 `7e5c5655de94d49885e13c369f0a71212893a0aa`，位于 `third_party/moyin-creator`。上游源码和许可证未改动。此前只有源码调研与子模块登记；本次新增了实际可运行的浏览器接入，详细边界见 [creation-integration.md](./creation-integration.md)。

### 本次实现

- `apps/creator` 是独立 Vite + React 18.3.1 包，使用自己的 `package-lock.json`；不加入主 npm workspace，不与 Next.js 的 React 19 混装。
- 直接复用上游分镜 `PropertyPanel`、项目/剧本 Store 与 `switchProject()`；新增浏览器入口、层级导航、标题/画面/时长表单和协议适配。
- 构建时为上游属性面板的编辑/保存/取消按钮增加无障碍名称，禁用未接入的媒体导演入口；适配写在 Vite 配置中，不修改子模块。
- 主平台项目页新增「进入魔因创作」，通过 iframe 传入完整项目文本快照，支持三种方向；方向与 Profile 保留。
- 支持编辑标题、画面、动作、对白、整数秒时长与镜头参数，在已有场景下新增/删除分镜；剧集和场景仍在主平台创建。
- 「另存回主平台」以新 UUID 创建项目副本，保留原项目。所有目录、扩展字段与请求标识在一个数据库事务中保存。校验失败和中途数据库失败不留下部分记录。
- 新迁移 `0002_creation` 增加 `creation_imports` 表，保存请求幂等信息与镜头扩展字段；原有目录数据保留。
- `GET /api/v1/creation/projects/{id}/snapshot` 导出快照；`POST /api/v1/creation/imports` 原子创建副本。
- 协议 `studio-moyin` 版本 1，两端检查 origin、source、版本和请求标识；有响应类型检查、超时与界面错误提示，不传 API Key。
- 浏览器草稿按快照摘要恢复，来源发生变化时建立新草稿。最近一次保存的摘要、请求标识和副本名称保存在 sessionStorage，支持响应丢失后的重试。
- 单次快照上限为 100 集、1000 场景、5000 分镜、4 MB 文本；时长仅接受 1–120 整数，不把小数自动取整。
- `npm run setup:local` 统一安装/迁移；`npm run dev:local` 统一启动本机 3000/8000/5173 三个服务，检查端口占用、处理联动退出和进程清理。

### 使用和存储边界

项目页 →「进入魔因创作」→ 编辑 → 魔因右侧属性面板先点击保存图标 → 填写副本名称 →「另存回主平台」→ 打开已保存副本。

- 标题、画面与时长直接写浏览器草稿；魔因属性面板中的动作、对白、镜头参数需点击保存图标提交单镜头修改。尚未提交时回存与切换镜头会提示。
- 浏览器草稿存于创作服务自己 origin 的 localStorage，带独立前缀；切换浏览器/端口或清理站点数据不会自动迁移未回存草稿。已回存内容存于 SQLite。
- 主平台普通分镜卡片展示原有字段；动作与镜头参数可再次进入创作模块查看。
- 这是魔因文本编辑组件的浏览器适配，不是全部桌面能力的移植。未接入模型调用、媒体生成、角色资产、导演媒体工作流、时间线、桌面文件系统和成片导出；所有 `generation_enabled` 仍为 false。
- 没有暴露上游任意 URL 代理，没有提供浏览器 API Key 配置。保留 AGPL 版权和原始许可证，浏览器适配包包含完整许可证副本；不宣称取得商业许可或替主仓库整体换证。

### 本次验证

- SQLite API / 迁移 / 预检测试 23 项通过，包含三种方向快照回存、字段/编号/ID/版本校验、重复请求、中途数据库失败回滚和已有数据库升级保留内容。
- 主工作台 TypeScript、ESLint、Next.js 生产构建通过；创作模块 Vite 生产构建通过。
- Chromium 端到端测试覆盖三种方向传入、原版魔因属性编辑、刷新恢复、回存及重开、原项目不变、异常时长、服务不可用重连、响应丢失重试与原有 3 项浏览器回归。
- 统一安装、三个服务启动、端口冲突检查、联动停止和 SQLite 重启恢复在 Linux 云环境实测；不表示用户电脑已运行。Windows/macOS 尚未实测。
- 没有配置或调用任何付费模型，没有验证媒体生成。PostgreSQL 测试保留在 CI 配置中，本次接入仅实测 SQLite。

## 本地运行

Node.js 22+、npm 10+、Python 3.12、uv；本地素材与样片另需 FFmpeg/ffprobe。仓库根目录可复制 `.env.example` 为 `.env`，默认 SQLite 无需 Docker：

```bash
npm run setup:local
npm run dev:local
```

工作台 `http://127.0.0.1:3000`，API `http://127.0.0.1:8000/docs`。从项目页进入创作模块；单独打开创作服务不会自动拥有项目上下文。

```bash
npm run test:api
npm run check:api
npm run typecheck
npm run lint
npm run build
npm run build:creator
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

最后一条是当前 Linux 云环境命令，用户电脑需按 README 安装 Playwright 浏览器。E2E 独立启动 8100/3100/5174 端口并使用临时 SQLite，不写日常数据库。接口改变后运行 `npm run api:types`，不要手改生成类型。

## 后续开发方向

先让用户在本机完成这一条文本创作流程，再按代表性镜头试制选择首个真实生产 Provider 或程序动画引擎。接入真实模型前，需要落实密钥保管、任务状态、超时/未知结果恢复、预算和资产存储。不要把三个生产 Profile 或文本创作接入等同于三条媒体生产线均已实现。

后续云端会话仍通过 Git 拉取最新 `work` 并初始化固定子模块；先核对状态、保留已有改动，再读本文和接入说明。
