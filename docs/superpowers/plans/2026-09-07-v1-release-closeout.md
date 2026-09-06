# EchoDesk v1.0 发布收尾 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前可演示的 EchoDesk 整理为可发布的 v1.0.0，包括正式演示数据、准确文档、验证记录和 GitHub 发布状态。

**Architecture:** 保持现有前后端架构不变。新增独立的根目录 demo 数据与来源说明；本地开发前端代理继续指向 8001，Docker 容器内部继续使用 8000；发布前通过测试、构建、Docker 配置和浏览器流程进行验证。

**Tech Stack:** React 18、TypeScript、Vite、Vitest、FastAPI、pytest、Docker Compose、Git/GitHub。

**Spec:** `docs/00-project-plan.md` 与用户在本轮确认的发布收尾清单。

## Global Constraints

- 本地开发后端使用 8001，Docker 宿主端口使用 8003，容器内部端口保持 8000。
- 演示数据必须明确标注为合成脱敏数据，不冒充真实客户数据。
- 保留 `.playwright-cli/` 中已有截图与下载产物，不删除用户可用的演示材料；通过 `.gitignore` 排除它们。
- 不实现 S2/S3 或 v2 功能；本次只完成发布收尾与正式 demo 数据整理。
- 推送前必须通过后端测试、前端测试、前端构建和 Docker Compose 配置校验。

---

### Task 1: 整理正式演示数据

**Files:**
- Create: `data/demo/flowdesk_feedback.csv`
- Create: `data/demo/SOURCE.md`

**Interfaces:**
- CSV 第一列为 `feedback_text`，确保 EchoDesk 导入页默认选中反馈文本列。
- CSV 额外提供 `feedback_id`、`source`、`role`、`submitted_at`、`severity` 字段，方便正式演示时展示数据治理能力。

- [x] **Step 1: 创建 60 条 FlowDesk 演示反馈**

  分为登录、导出、客服三个主题，各 20 条；数据标注为合成脱敏，仅用于演示。

- [x] **Step 2: 创建来源说明**

  记录案例背景、字段定义、数据限制和推荐演示流程，避免把合成数据表述为真实采集数据。

- [x] **Step 3: 校验 CSV 可解析**

  使用 Python `csv` 模块读取文件，确认表头、行数、非空反馈文本和 UTF-8 编码。

### Task 2: 更新发布文档与版本信息

**Files:**
- Modify: `README.md`
- Modify: `docs/00-project-plan.md`
- Modify: `docs/04-iteration-log.md`
- Modify: `backend/e2e/test_ui.py`

**Interfaces:**
- README 的本地启动端口、测试数量和 demo 数据入口必须与当前仓库一致。
- 项目计划的 Docker 和正式 demo 数据状态必须反映实际验证结果。
- e2e 注释不得继续把本地后端固定描述为 8000；前端代理实际指向 8001。

- [x] **Step 1: 更新 README**

  补充 `data/demo/flowdesk_feedback.csv` 入口，将测试数量更新为后端 78、前端 35，并区分本地 8001 与 Docker 宿主 8003 / 容器 8000。

- [x] **Step 2: 更新项目完成清单**

  将 Docker Compose 和独立正式 demo 数据标为已交付；保留真实访谈、真人评测、S2/S3 和 v2 功能为未完成事项。

- [x] **Step 3: 更新迭代记录和 e2e 说明**

  记录 v1.0 发布收尾，修正端口和测试数量等事实描述。

### Task 3: 清理发布工作区

**Files:**
- Modify: `.gitignore`
- Inspect: `.playwright-cli/`

**Interfaces:**
- `.playwright-cli/` 保留在本地供截图使用，但不进入 Git 提交。

- [x] **Step 1: 检查生成产物**

  确认目录只包含 Playwright 截图、快照、日志和本轮下载的本地 PRD 文件。

- [x] **Step 2: 增加忽略规则**

  在 `.gitignore` 中增加 `.playwright-cli/`，不删除已有截图。

- [x] **Step 3: 运行 Git 工作区检查**

  使用 `git status --short` 确认截图目录不再作为未跟踪改动出现。

### Task 4: 发布前验证

**Files:**
- No source changes.

**Interfaces:**
- 后端 pytest、前端 Vitest、前端构建、Docker Compose 配置和浏览器 e2e 必须分别记录实际结果。

- [x] **Step 1: 运行后端测试**

  Run: `backend/.venv/Scripts/python.exe -m pytest -q`
  Expected: 78 tests pass with no failures.

- [x] **Step 2: 运行前端测试和构建**

  Run: `npm run test` and `npm run build` in `frontend/`.
  Expected: 35 tests pass and build exits 0.

- [x] **Step 3: 校验 Docker Compose**

  Run: `docker compose config -q`.
  Expected: exit 0.

- [x] **Step 4: 运行正式 demo 烟测**

  通过本地前端导入 `data/demo/flowdesk_feedback.csv`，选择 `feedback_text` 列，完成清洗、聚类、PRD 生成和导出验证。

### Task 5: 提交、推送和创建 v1.0.0 标签

**Files:**
- Git commit containing Tasks 1–3 and documentation updates.

**Interfaces:**
- 提交前保持 `.playwright-cli/` 被忽略；提交后 `main` 推送到 `origin/main`。
- 创建并推送 annotated tag `v1.0.0`，指向发布提交。

- [x] **Step 1: 查看 diff 并运行 `git diff --check`**
- [ ] **Step 2: 提交发布收尾改动**
- [ ] **Step 3: 推送 `main` 到 GitHub**
- [ ] **Step 4: 创建并推送 `v1.0.0` 标签**
- [ ] **Step 5: 用 `git ls-remote` 验证远程分支和 tag**
