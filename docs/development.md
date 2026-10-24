# 开发指南

## 运行与配置

完整文本创作接入使用 `npm run setup:local` 安装，再用 `npm run dev:local` 统一启动本机工作台、API 和魔因创作服务；无需 Docker。独立 React 18 包、快照字段、消息边界和许可说明见 [魔因接入说明](./creation-integration.md)。

根目录 `.env` 由 Python 配置层和 Next.js 配置层读取。前端浏览器通过同源 `/api/v1` 请求，由 Next.js 转发给 `STUDIO_API_ORIGIN`，不把服务端配置或密钥打包给浏览器。

API 启动不自动建表；必须显式运行 Alembic 迁移。`/health/live` 只检查进程，`/health/ready` 检查数据库和当前迁移版本。改动数据库后需增加迁移，并同步调整迁移就绪检查。

本地 API、前端及 Compose 映射端口默认绑定回环地址。当前配置只接受 `local`、`test` 环境，正式发布前需要完成权限、运行配置和部署设计。

## 接口清单

| 方法       | 路径                             | 作用                         |
| ---------- | -------------------------------- | ---------------------------- |
| GET        | `/api/v1/overview`               | 内容目录实际数量             |
| GET        | `/api/v1/production-profiles`    | 当前版本化生产配置           |
| GET / POST | `/api/v1/projects`               | 分页搜索或创建项目           |
| GET        | `/api/v1/projects/{id}`          | 项目详情                     |
| GET / POST | `/api/v1/projects/{id}/episodes` | 剧集列表或创建               |
| GET / POST | `/api/v1/episodes/{id}/scenes`   | 场景列表或创建               |
| GET / POST | `/api/v1/scenes/{id}/shots`      | 分镜列表或创建               |
| PUT        | `/api/v1/shots/{id}`             | 保存完整分镜内容并检查修订号 |
| GET        | `/api/v1/creation/projects/{id}/snapshot` | 导出版本化文本创作快照 |
| POST       | `/api/v1/creation/imports`       | 原子另存项目副本并保留镜头扩展字段 |
| GET / PUT  | `/api/v1/story/projects/{id}`    | 读取或保存故事草稿，检查 revision |
| POST       | `/api/v1/story/projects/{id}/preview` | 预览已保存版本的结构化剧本目录 |

项目列表支持 `q`、`offset`、`limit`，搜索按项目名称，通配符按字面处理。返回 `items`、`total`、`offset`、`limit`。剧集、场景、分镜目前按父对象完整返回，扩大量级前需补充对应分页。

父记录不存在返回 404；编号冲突和过期分镜修订返回 409；非法输入或 Profile 与内容类型不匹配返回 422。字段长度、编号和时长同时在接口与必要的数据库约束中校验。

分镜更新需要提交当前 `revision`，使用原子条件更新防止丢失编辑。成功后修订号加一。修订号不保存旧内容，不能作为完整版本历史使用。数据库表暂不暴露媒体生成状态和批准操作。

当前 PUT 契约中对白、描述、时长存在默认值；客户端应发送完整内容，省略的可选字段会使用默认值，不具有 PATCH 的部分更新语义。

## 数据模型与迁移

目录主链是 Project → Episode → Scene → Shot；外键、父范围内编号唯一约束及索引由显式迁移创建。Season 等远期对象暂不建空表。

创建迁移：

```bash
uv run --directory apps/api alembic revision --autogenerate -m "describe change"
```

检查生成内容，明确数据迁移和回滚影响，再执行：

```bash
npm run db:migrate
uv run --directory apps/api alembic check
```

已有迁移不要为了新变更直接重写。首次迁移的模型与 Schema 约束仍是框架范围，后续版本、剧情状态、预算与工作流对象应逐步增加。

## API 契约与前端

`studio.export_openapi` 从 FastAPI 导出 `packages/contracts/openapi.json`；`openapi-typescript` 生成前端 `api-schema.ts`。生成文件提交仓库，修改后运行 `npm run api:types`，不要手工修改生成文件。

API 封装统一处理连接与验证错误，前端使用 SWR 读取和刷新数据。页面明确区分加载、空数据、异常和实际结果，不用假统计或假素材代替尚未实现的能力。

## 生产扩展边界

Profile 注册表当前是后端代码中的只读、不可变版本。变更已有 Profile 的行为时新增版本，不就地改变原 ID 的语义。后续可迁移为数据库管理，但必须保留版本标识与快照。

VideoProvider 是协议接口，没有默认实现。接入厂商时先补能力表、预检、请求标识、厂商任务持久化、未知结果核对、预算预留和实际费用记录，再开放界面生成按钮。

Temporal 目前仅注册预检工作流。业务创建接口不自动启动工作流；还没有事务 Outbox，也不承诺完整生产任务恢复。接入有外部副作用的生成任务前，需要按架构方案实现这些能力。

预检 Activity 是无外部副作用的验证，重试有次数上限，输入错误不重试。后续不得将质量重生成嵌入技术重试中。

## 测试

API 用例通过真实 Alembic 迁移建立隔离的 SQLite，包括内容链路、父子关系、Profile 匹配、重复编号、搜索分页与并发更新检查。迁移测试检查模型漂移与升降级。

可额外使用专门的 PostgreSQL 测试数据库运行相同 API 用例：

```bash
# macOS / Linux；该数据库内的目录表将被测试清空。
STUDIO_TEST_POSTGRES_URL=postgresql+psycopg://studio:studio_local@127.0.0.1:5432/studio_test npm run test:api
```

PowerShell：

```powershell
$env:STUDIO_TEST_POSTGRES_URL = "postgresql+psycopg://studio:studio_local@127.0.0.1:5432/studio_test"
npm run test:api
Remove-Item Env:STUDIO_TEST_POSTGRES_URL
```

必须先创建 `studio_test`，禁止指向日常开发或生产数据库。PostgreSQL 变量未设置时只运行 SQLite。

端到端测试覆盖创建项目、剧集、场景与分镜，编辑与刷新后持久化，并检查手机尺寸下的布局。浏览器测试使用自己的数据库和端口；测试失败时保留 Playwright trace。

环境中已有 Chromium 时，可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定可执行文件；未设置时使用 Playwright 安装的浏览器。例如 Linux 可设置为 `/usr/bin/chromium`。这不会改变普通开发和 CI 的默认行为。

GitHub Actions 配置运行 API 双数据库测试、格式与静态检查、前端构建、契约一致性和浏览器测试。远程 CI 结果需在仓库实际运行后确认。
