# EchoDesk · AI 需求工作台

> 把散落在问卷、访谈、应用商店评论、群聊里的海量用户反馈，通过 AI 管线自动归类、提炼洞察、生成 PRD 草稿，并由 PM 人工审核采纳。

**30 秒演示**：上传反馈文件（或粘贴文本、载入内置示例）→ 自动清洗 → 语义聚类出主题簇（含情感与代表原文）→ 勾选主题 → AI 生成结构化 PRD 草稿 → 人工审核编辑 → 导出 Markdown。

```
60 条三主题真实反馈（登录故障/导出缺陷/客服失联）
  → 清洗 60/60 有效 → HDBSCAN 聚出 3 簇（噪声 2 条被正确拒绝归类）
  → LLM 命名 3/3 合理 → PRD 草稿 3,213 字 / 65.6s / 结构完整度检查 10/10
```

**洞察页**——60 条杂乱反馈自动聚出 3 大主题，每簇含情感、概述与代表原文，可展开回溯全部成员：

![洞察页：60 条反馈自动聚出 3 大主题](docs/screenshots/insights.png)

***

## 1. 解决什么问题

产品经理每周要花数小时整理杂乱的用户反馈：问卷开放题、应用商店评论、客服工单、群聊记录——格式不一、语言口语化、真假诉求混杂。人肉归类的结果是：

- **慢**：几百条反馈整理一次要半天到一天

- **糙**：凭印象归类，主题边界模糊，小样本诉求被淹没

- **断**：从"反馈"到"PRD"之间没有可追溯的链路——评审会上没人说得清某条需求到底来自多少条反馈

（用户调研详情见 [docs/01-user-research.md](docs/01-user-research.md)）

## 2. 方案：一条可回溯的 AI 管线

```
导入            清洗              洞察                 生成           审核
CSV/XLSX/TXT → 去空/去重/截断 → 语义向量 → 降维 →  →  LLM 生成     →  人工编辑
粘贴文本        手机号/邮箱脱敏    HDBSCAN 密度聚类      结构化 PRD      还原 AI 原稿
               (M1)             + LLM 主题命名/情感     (M5)          下载 .md (M5)
                                 (M2/M3)
```

每一步的产出都可回溯到原始反馈：簇卡片可展开全部成员原文；PRD 的每条需求都标注**来源主题与反馈量**（如「来源：登录流程故障频发，19 条」）。

## 3. AI 设计立场：能力边界的三个决策

这个项目对"AI 在需求工作流中该扮演什么角色"有明确立场，也是与"全自动生成 PRD"工具的核心差异：

1. **AI 聚类，人不圈定**——主题从数据中密度聚类而来（HDBSCAN 自动判簇数、拒绝噪声），而非预置分类体系。防止"先有结论再找证据"。
2. **AI 起草，人必审**——PRD 永远以"草稿"存在，审核页强制经过人工编辑确认；AI 原稿保留可随时还原对比。Prompt 中专门要求 AI 列出「风险与开放问题」——明确标出需要人类决策的事项，而不是假装全知。
3. **降级不断服**——LLM 真实调用失败时自动降级到本地 embedding / mock 模式（独立熔断），管线永远能跑通、状态前端可见。AI 是增强，不是单点依赖。

**PRD 审核页**——AI 生成结构化草稿（每条需求标注来源主题与反馈量），人工编辑后导出；可随时还原 AI 原稿对比：

![PRD 审核页：AI 草稿 + 人工编辑 + 还原原稿](docs/screenshots/review.png)

## 4. 工程亮点（面试官可能关心的）

- **四级向量降级链**：真实 Embedding API → 本地 sentence-transformers（bge-small-zh，隐私模式）→ TF-IDF → 哈希；聚类降级 HDBSCAN → KMeans（轮廓系数自动选 K）

- **reasoning 模型踩坑实录**：方舟 glm-5-3-flash 生成 PRD 时，深度思考会耗尽 `max_tokens` 配额导致正文为空（213s 白跑）。定位后以 `reasoning_effort=low` 解决——reasoning\_tokens 1633→0，耗时/成本降至 1/4，质量无损。详见 [迭代日志 v0.4.0](docs/04-iteration-log.md)

- **中文数据现实**：CSV 解析做了 BOM 剥离与 GBK 检测链（Excel 另存/中文 Windows 记事本两大坑），零第三方探测依赖

- **测试**：37 个单元测试离线 2 秒跑完（CI 无凭据可用，LLM 全 mock）；每个里程碑均带 API 级 e2e 验证

- **Prompt 版本化**：PRD 生成 Prompt 独立文件管理（`backend/app/prompts/prd/generation.txt`），不散落在代码里

## 5. 效果验证（MVP 实测）

| 验证项            | 结果                                                    |
| -------------- | ----------------------------------------------------- |
| 聚类准确率（60 条三主题） | 3 簇全部正确，噪声 2 条（边界样本被正确拒绝归类）                           |
| 主题命名质量         | 3/3 人工判定合理，情感判断全对                                     |
| PRD 生成         | 3,213 字 / 65.6s；结构完整度 10/10（六章齐全、来源标注、优先级带理由、验收标准可量化） |
| 编码兼容           | GBK / UTF-8 BOM / XLSX 实测无乱码                          |
| 降级链            | LLM 断连时管线照常应答，前端显示降级状态                                |

（指标体系与盲评设计见 [docs/03-metrics.md](docs/03-metrics.md)）

## 6. 快速开始

```bash
# 后端（Python 3.12+）
cd backend
python -m venv .venv && .venv\Scripts\activate    # Windows
pip install -r requirements.txt
copy .env.example .env                            # 填入你的 LLM key（或保持 LLM_MODE=mock 离线体验）
uvicorn app.main:app --port 8000

# 前端（Node 18+）
cd frontend
npm install
npm run dev                                        # http://localhost:5173
```

- 没有 LLM key？设 `LLM_MODE=mock` 即可离线跑通全流程（聚类走本地向量，LLM 返回确定性占位结果）

- 支持任意 OpenAI 兼容端点（火山方舟 / 智谱 / DeepSeek / OpenAI），配置说明见 `backend/.env.example`

- 首次运行本地向量模式会下载 bge-small-zh 模型（约 100MB）；无网环境自动降级 TF-IDF

## 7. 技术架构

```
frontend/  React 18 + TypeScript + Vite（无 UI 库，路由 react-router）
   │  4 页面：导入 / 洞察（管线串联+簇卡片）/ PRD 审核（编辑/还原/下载）/ 导出（规划中）
   ▼  fetch（dev 经 Vite 代理）
backend/   FastAPI + pydantic-settings
   ├─ api/pipeline.py    REST 端点（import/clean/cluster/prd-gen + SSE 进度通道）
   ├─ services/
   │   ├─ ingest.py      CSV/XLSX/TXT 解析（编码链）
   │   ├─ clean.py       清洗（纯函数）
   │   ├─ cluster.py     向量→UMAP→HDBSCAN→LLM 命名（独立熔断）
   │   └─ prd.py         PRD 生成（reasoning_effort=low）
   ├─ core/llm.py        LLM Provider 抽象：live/mock/auto + 指数退避 + 熔断降级
   └─ prompts/prd/       Prompt 版本化文件
```

## 8. 项目文档

- [项目计划（含 MoSCoW 范围与 14 天排期）](docs/00-project-plan.md)

- [用户调研](docs/01-user-research.md)

- [PRD](docs/02-prd.md)

- [指标与验证](docs/03-metrics.md)

- [迭代与决策记录](docs/04-iteration-log.md)（8 个版本，含每次技术决策的备选方案与理由）

- [竞品分析](docs/05-competitive-analysis.md)

## 9. 路线图

- **v0.7**：浏览器端 e2e 测试（Playwright，截图脚本已就位）；Docker 镜像发布

- **v2 构想**：多轮反馈增量合并、需求去重与关联（跨批次）、Jira/飞书对接

## 10. 技术栈

React 18 · TypeScript · Vite | FastAPI · pydantic | UMAP · HDBSCAN · sentence-transformers(bge-small-zh) | OpenAI 兼容 LLM API（火山方舟 glm-5-3-flash 实测） | pytest（46 tests）

***

*本项目的产品文档、PRD、迭代决策记录同样由 AI 辅助 + 人工审核完成——它自己就是自己目标工作流的一次实践。*
