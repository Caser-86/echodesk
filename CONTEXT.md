# Project Context

> 以 2026-09-19 仓库状态为准。本文是继续开发前的当前事实入口；历史过程和产品论证分别见 `docs/04-iteration-log.md`、`docs/01-user-research.md` 和 `docs/02-prd.md`。

## 项目目标

EchoDesk 将 CSV、XLSX、TXT、粘贴文本或内置示例中的用户反馈，经过清洗、语义聚类和主题洞察后生成 PRD 草稿，并把结果交给 PM 人工审核、导出和继续拆解为用户故事卡。核心价值是让“反馈 → 洞察 → 需求”的链路可回溯，而不是让 AI 代替最终决策。

## 当前状态

- 版本：`1.1.0`，`main` 已推送 GitHub，最近提交为 Docker 前端端口修复。
- 核心闭环已可运行：导入 → 清洗 → 聚类/洞察 → PRD 草稿 → 人工审核 → 导出。
- S2 任务拆解与 S3 浏览器本地处理历史已交付。
- 默认无 LLM key 时使用 `auto` → `mock`，可离线演示；真实 LLM 需要配置 OpenAI 兼容端点。
- Docker 默认端口：前端 `5174`、后端 `8003`；本地开发端口：前端 `5173`、后端 `8001`。Docker 前端宿主端口可用 `FRONTEND_PORT` 覆盖。

## 已完成功能

- 文件导入：CSV/XLSX/TXT 上传、表头处理、列预览、粘贴文本和内置示例。
- 数据清洗：去空、去重、长度截断、手机号/邮箱脱敏，并返回清洗统计。
- 主题洞察：本地/远程 embedding 降级链、UMAP（满足样本量时）、HDBSCAN/KMeans 聚类、情感和代表原文。
- PRD：按选中主题生成 Markdown 草稿；支持编辑、还原原稿和下载。
- 审核指标：记录生成、编辑、下载、导出事件，统计 PRD 采纳率；JSONL 达到大小上限后自动归档。
- 任务拆解：为每个主题生成确定性用户故事卡，包含验收标准、优先级、反馈数量和原文证据，可下载 Markdown。
- 处理历史：使用浏览器 `localStorage` 保存最近 12 个审核会话，支持打开恢复和删除。
- 前端体验：响应式布局、暗色模式、五个页面（导入、洞察、审核、导出、历史）。
- 验证体系：后端 pytest、前端 Vitest、生产构建，以及显式开启的 Playwright E2E。

## 当前未完成

- 真人 PM 访谈、PM 盲评和问卷级指标实验；现有结论只能称为自测或桌面研究。
- 词云、多语言自动翻译、飞书/Jira 导出或集成。
- 多轮反馈增量合并、跨批次需求去重与关联。
- 多账号、云端数据库、实时协作和自动采集爬虫不在当前 MVP 范围。

详见 [TODO.md](TODO.md)。不要把合成演示数据或 mock 结果描述成真实用户验证。

## 当前技术栈

- 前端：React 18、TypeScript、Vite、React Router、Vitest、React Testing Library、CSS tokens。
- 后端：Python、FastAPI、Pydantic Settings、httpx、NumPy/Pandas、scikit-learn、UMAP、HDBSCAN、sentence-transformers、openpyxl。
- 外部模型：OpenAI 兼容 Chat/Embedding 接口，可切换 `live`、`mock`、`auto`。
- 部署：Docker Compose，前端 Nginx 反代 `/api` 到后端。
- 存储：审核日志 JSONL + 浏览器 localStorage；当前没有应用数据库。

## 核心架构

1. `frontend/src/pages/Import.tsx` 负责输入和导入交接。
2. `frontend/src/pages/Insights.tsx` 调用 `/api/pipeline/clean` 与 `/api/pipeline/cluster` 展示主题并选择 PRD 输入。
3. `frontend/src/pages/Review.tsx` 调用 `/api/pipeline/prd-gen` 和 `/api/pipeline/task-cards`，保存审核会话并上报事件。
4. `frontend/src/pages/Export.tsx` 下载 PRD、洞察和主题数据，展示审核统计；`History.tsx` 管理本地会话。
5. `backend/app/api/` 暴露导入、清洗、聚类、PRD、任务卡、健康检查和审核日志 API；`backend/app/services/` 实现处理逻辑。

## 关键目录

- `frontend/src/`：React 页面、API 封装、共享组件和测试。
- `backend/app/`：FastAPI 路由、配置、LLM 抽象、业务服务和 Prompt。
- `backend/tests/`：离线后端测试；`backend/e2e/`：显式门控的浏览器测试。
- `data/demo/`：合成脱敏演示数据及其来源说明。
- `docs/`：项目计划、PRD、研究、指标、竞品和迭代记录。
- `docker-compose.yml`：一键运行配置。

## 关键技术决策

- LLM 失败时允许降级到 mock，避免外部凭据阻塞演示和 CI。
- 任务卡使用确定性模板，不依赖 LLM，保证离线演示可重复。
- 处理历史留在浏览器，不上传服务器，符合当前单机 MVP 边界。
- 审核日志使用进程锁和按大小轮转的 JSONL，保留轻量迁移路径。
- AI 只提供聚类、洞察和草稿；优先级最终判断、审核采纳和产品决策保留给人。

## 已知限制

- 没有配置 LLM key 时，PRD 是 mock 占位输出，不代表真实模型质量。
- 首次本地 embedding 可能需要下载约 100MB 模型；无网时继续降级到 TF-IDF/哈希路径。
- `E2E=1` 是浏览器测试的显式开关，默认 pytest 只收集 `backend/tests/`。
- `sqlmodel` 尚在依赖文件中，但当前代码没有使用数据库持久化；如不准备实现数据库，应在后续依赖清理中确认是否移除。

## 下一步

按优先级见 [TODO.md](TODO.md)。在新增功能前，先更新本文和 TODO 的状态，再补测试与 README 使用说明。
