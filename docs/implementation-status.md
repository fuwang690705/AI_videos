# 实施状态

更新：2026-10-19。此处区分已实现框架与总体架构目标。

## 已实现

- npm workspace monorepo、Python uv 锁文件与前端 npm 锁文件。
- Next.js 中文项目中心、搜索分页、项目创建与错误状态。
- 项目详情工作台：创建剧集、场景、分镜，查看与编辑分镜。
- FastAPI 版本化 API、输入验证、OpenAPI 导出和前端类型生成。
- SQLAlchemy 模型、Alembic 初始迁移、父子外键、编号唯一约束及并发编辑检查。
- SQLite 直接启动与 PostgreSQL + pgvector 的可选开发配置。
- 三种版本化 Profile 绑定；所有生成标志关闭。
- 独立 Temporal Worker、受限重试的快照预检及命令行调用。
- Provider 生命周期协议边界，尚无真实实现。
- API、迁移、预检和浏览器端到端测试；CI 配置。

## 下一阶段

1. 用代表性镜头试制，确定首条生产线、输出规格、预算与首批厂商。
2. Story Bible、结构化剧情事实、角色知识与批准范围。
3. 资产版本、媒体存储、输入快照与依赖追踪。
4. 持久化生产任务、ProviderJob、事务 Outbox、预算预留与未知结果核对。
5. 接入首条生产引擎的图像 / 视频或程序动画，以及配音和时间线。
6. 质量样例、规则质检、人工审核与成片导出。

## 尚未实现的远期模块

完整 RAG、LangGraph 推理链、模型动态路由、Jev 与多模态质检、完整版本历史、身份一致性与口型、自动发布和渠道分析。

权限与正式部署配置也需要在多人使用或对外开放前完成。暂不创建只有空文件和虚构运行状态的模块；按实际用例逐步建立领域边界。

## 本次搭建验证

- SQLite 与 PostgreSQL API 测试、迁移往返与预检单元测试：13 项通过。
- Chromium 端到端测试：2 项通过，覆盖完整目录创建、分镜编辑持久化与手机布局。
- 前端 TypeScript、ESLint、生产构建通过；Python Ruff 检查通过。
- PostgreSQL + pgvector 开发容器已启动并验证扩展。
- Temporal 开发服务和独立 Worker 已实际运行，预检工作流返回 `validated=True`、`generation_enabled=False`。
- 云端下载 Playwright 浏览器受到域名策略限制；浏览器测试使用环境中已有的 `/usr/bin/chromium` 完成。
- GitHub Actions 仅完成配置，尚未在远程仓库执行。
