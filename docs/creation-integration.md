# 魔因浏览器创作接入

本次交付跑通「主平台项目传入 → 魔因分镜文本编辑 → 另存项目副本 → 刷新后读取」。三种生产方向共用这条文本创作流程，各自的 Profile 绑定保留。媒体生产仍需后续独立接入。

## 运行

安装 Node.js 22+、npm 10+、Python 3.12 与 uv；在主项目根目录执行：

```bash
npm run setup:local
npm run dev:local
```

打开 http://127.0.0.1:3000，在项目页点击「进入魔因创作」。统一启动先迁移数据库，再启动 3000 端口 Next.js、8000 端口 FastAPI 与 5173 端口 Vite；绑定本机回环地址，Ctrl+C 停止所有子进程，任一服务退出时停止其他服务。端口被占用会明确报错，避免 Vite 自动换端口导致连接错位。

脚本使用跨平台 Node.js 进程管理，Windows 分支使用 taskkill 清理进程树；本次实际运行与浏览器验证在 Linux 云环境完成，尚未在用户 Windows/macOS 电脑执行。这里的云端 localhost 不代表用户电脑已启动。

`npm run setup:local` 安装根目录与 `apps/creator` 的独立 npm 锁文件，再安装 Python 锁定依赖并迁移；不运行上游 Electron 安装、PowerShell prebuild 或桌面打包。仅主工作台开发可继续使用原来的独立命令。

## 结构与浏览器适配

- `third_party/moyin-creator`：固定在 `7e5c5655de94d49885e13c369f0a71212893a0aa`，上游源码和版权声明保持原样。
- `apps/creator`：独立 npm 包，React/React DOM 固定 18.3.1，独立 Vite 构建与锁文件，不加入主 npm workspace。主工作台继续使用 React 19。
- 浏览器入口直接复用上游 `PropertyPanel`、`script-store`、`project-store` 与 `switchProject()`；新增层级导航与基础分镜字段表单。未整体启动上游 Electron App，也未接入其桌面全部界面。
- Vite 按创作包的位置解析上游的依赖，保留 package exports，避免意外引用根目录 React 19。模块通过 iframe 通信，两个 React 运行时与样式互相隔离。
- 构建时对固定版本的属性面板做小范围适配：禁用尚未接入的 AI 导演按钮，补充编辑、保存、取消图标按钮的无障碍名称。适配逻辑写在 `apps/creator/vite.config.ts`；上游文件未修改。
- 存储适配器替换上游 `indexed-db-storage` 的导入，使用带 `studio-moyin:` 前缀的 localStorage，保留上游按项目路由和切换顺序，不伪造 Electron 文件系统接口，不迁移桌面数据。发生存储错误显示提示，可尝试立即回存到 API。
- 相同源快照按内容摘要恢复浏览器草稿；源数据已修改会建立新草稿，避免覆盖以前的编辑。源快照的 ID 也参与摘要。
- 工作台与编辑区共用 `packages/theme/studio.css`，沿用原有浅色、青柠与淡紫配色、字体及表单风格；魔因编辑、保存、取消按钮有可见文字。React 与样式作用域继续隔离。
- 没有复制上游任意 URL 代理、自动模型同步、更新检查或 API Key 配置界面。当前可离线完成文本编辑；安装依赖和初始化子模块仍需网络。

## 支持的字段

| 主平台 | 魔因 | 回存方式 |
|---|---|---|
| 项目名称、简介、方向与 Profile | 项目 / 剧本基本信息 | 副本名称由用户填写，其余继承源快照 |
| 故事原文、大纲、世界观、人物与连续性约束 | 可选 `story` 快照字段 | 工作台的「故事与设定」编辑，另存时原样传递并持久化 |
| 剧集、场景的编号、标题、简介、地点 | Episode / ScriptScene | 保留层级与非连续编号，当前在主平台创建这些记录 |
| 分镜标题 | `studioTitle` 适配字段 | 写入新分镜标题，最长 120 字符 |
| 画面描述 | `visualDescription` | 最长 10000 字符 |
| 对白 | `dialogue` | 最长 10000 字符 |
| 整数秒时长 | `duration` | 严格要求整数 1–120，不进行小数取整 |
| 动作描述 | `actionSummary` | 独立扩展字段，最长 10000 字符，不截断为标题 |
| 景别、镜头运动、特殊手法 | `shotSize` / `cameraMovement` / `specialTechnique` | 保存到副本的创作扩展记录，重新进入创作模块仍可读取 |

支持在现有场景中添加、删除分镜。标题、画面与时长直接更新草稿；右侧魔因属性编辑器中的动作、对白与镜头参数需先点击保存图标。存在尚未提交的属性表单时，切换镜头和项目回存会提示先保存或取消，避免静默丢失。

当前不接受角色、图片、视频、音频、任意扩展对象或 API Key；它们不在这条快照协议中。主平台普通分镜卡片展示其已有字段；动作和镜头参数在创作模块中查看。浏览器草稿容量受 localStorage 限制，不是媒体存储方案；换浏览器、换端口或清理站点数据不会自动迁移未回存草稿。

## 接口与一致性

- `GET /api/v1/creation/projects/{project_id}/snapshot`：版本 1 的完整文本树，读取最新目录数据和已保存的镜头扩展字段。
- `POST /api/v1/creation/imports`：接收 `request_id`、副本名称、版本化 `snapshot`，仅创建新项目副本；给所有目录记录分配新 UUID，不修改源项目。
- 创建副本与所有子记录、镜头扩展字段、请求标识在同一事务提交；校验或数据库写入失败时不遗留部分项目。
- 同一请求标识和内容返回同一项目；标识复用于不同内容返回 409。浏览器 sessionStorage 保留最近一次保存的内容摘要、标识与副本名称，支持 API 已写入但响应丢失后的重试与刷新恢复。
- 后端严格校验已登记且匹配的 Profile、字段长度、编号范围、全树 ID 唯一性和同级编号唯一性。层级嵌套代替外部父 ID 引用，避免串到其他项目。
- 单次创作快照最多 100 集、1000 场景、5000 分镜和 4 MB 文本；超限返回校验错误，不代表平台已通过大规模生产能力验收。
- 迁移 `0002_creation` 添加独立创作导入表，`0003_story` 添加故事草稿表，均保留已有目录数据；现有分镜 revision 并发编辑逻辑保留。这不是完整版本历史系统。
- 版本 1 新增可选 `story` 字段；旧文本快照仍可导入。无故事元数据的快照在计算浏览器草稿摘要时省略此字段，兼容早先未回存草稿。

## 消息边界与错误反馈

`packages/creation/protocol.ts` 定义 `studio-moyin` 通道与版本 1：PING/READY、IMPORT/LOADED、EXPORT/EXPORTED、ERROR。两端检查精确 origin、窗口 source、协议版本和请求标识，父窗口还检查预期响应类型；消息不携带密钥。创作服务仅接受本机 HTTP 父窗口地址，主平台默认本机 5173；分开启动时可通过根 `.env` 的 `NEXT_PUBLIC_STUDIO_CREATOR_ORIGIN` 指定其他本机地址。

连接/消息等待有超时，界面提示统一启动命令和重新连接；HTTP 请求有超时，输入校验错误显示字段路径。当前是无登录的本地开发模式，不作为服务器部署方案。

## 许可证与源码

魔因漫创 © 2025 hotflow2024（MemeCalculate），上游包声明 `AGPL-3.0-or-later`，原始 `LICENSE`、`COMMERCIAL_LICENSE.md` 和源码版权头均保留。浏览器适配包与其使用的原版组件一起按 AGPL-3.0-or-later 提供，`apps/creator/LICENSE` 是完整许可证副本；界面链接到固定版本上游源码。共享通信协议和主平台桥接代码均在本仓库中可查看。本次没有替整个主项目重新指定许可证，也没有取得商业许可。

分发时应提供主仓库的适配源码、锁文件和固定子模块源码，并遵守适用的 AGPL 源码提供要求。后续闭源或商业分发需另行核实适用许可。

## 验证

检查命令：

```bash
npm run test:api
npm run check:api
npm run typecheck
npm run lint
npm run build
npm run build:creator
npm run test:e2e
```

浏览器测试需安装 Playwright Chromium，或在 Linux 使用已有浏览器的 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`。测试独立启动 8100/3100/5174 端口，使用临时 SQLite，不写日常数据库。测试覆盖三种方向的完整传入/编辑/另存/重新打开、浏览器草稿刷新恢复、非连续层级编号、镜头扩展字段、小数时长拒绝、服务不可用及重新连接、响应丢失重试和原有工作台回归；API 测试还覆盖事务中途失败回滚、重复编号/ID、无效 Profile、未知字段与协议版本。

模型调用、视频/图像生成、导演媒体工作流、桌面文件访问和成片导出没有在本接入中实现或验证，`generation_enabled` 保持 false。PostgreSQL 可由 CI 执行同一套 API 测试；本次接入的实际验证以 SQLite 为准。
