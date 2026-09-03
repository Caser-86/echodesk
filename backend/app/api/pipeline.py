"""AI 管线路由（M1~M7 的 API 出口）。

当前为骨架：提供管线各阶段的空端点与 SSE 进度通道，M3~M7 实现将在
后续迭代填充（对应 docs/04-iteration-log.md 的版本演进）。
"""

import asyncio

from fastapi import APIRouter, UploadFile

router = APIRouter(prefix="/pipeline", tags=["pipeline"])

# 管线阶段定义（驱动前端进度条与后续实现顺序）
PIPELINE_STAGES = [
    "ingest",
    "clean",
    "embed",
    "cluster",
    "insight",
    "prd_gen",
    "review",
    "export",
]


# ---- M1 数据导入 ----
@router.post("/import")
async def import_feedback(
    file: UploadFile | None = None, has_header: bool = True
) -> dict:
    """M1 数据导入：CSV/XLSX/TXT 上传解析。

    multipart body：file；query：has_header（默认 true，"false" 为无表头）。
    返回：列名、数据行（≤ max_rows）、截断标记。列的选择由前端完成。
    """
    from app.services.ingest import parse_upload

    if not file or not file.filename:
        return {"stage": "ingest", "status": "error", "message": "未收到文件"}

    data = await file.read()
    if len(data) > 20 * 1024 * 1024:
        return {"stage": "ingest", "status": "error", "message": "文件超过 20MB 上限"}

    result = parse_upload(file.filename, data, has_header=has_header)
    return {
        "stage": "ingest",
        "status": result.status,
        "message": result.message,
        "filename": result.filename,
        "format": result.format,
        "n_rows": result.n_rows,
        "n_cols": result.n_cols,
        "columns": result.columns,
        "rows": result.rows,
        "truncated": result.truncated,
    }


# ---- M2 清洗去重 ----
@router.post("/clean")
async def clean_feedback(body: dict | None = None) -> dict:
    """M2 清洗去重：去空值/去重/截断/脱敏，并返回清洗报告。

    body: {"texts": [str, ...], "max_len": 500}
    """
    from app.core.config import get_settings
    from app.services.clean import CleanOptions, clean_records

    texts = (body or {}).get("texts", [])
    if not isinstance(texts, list) or not texts:
        return {"stage": "clean", "status": "error", "message": "texts 需为数组"}

    # 输入条数上限复用 max_rows：防止超大请求拖垮单进程 embedding/聚类
    max_rows = get_settings().max_rows
    if len(texts) > max_rows:
        return {
            "stage": "clean",
            "status": "error",
            "message": f"texts 超过 {max_rows} 条上限，请分批或压缩后重试",
        }

    max_len = int((body or {}).get("max_len", get_settings().max_text_len))
    result = clean_records(texts, CleanOptions(max_len=max_len))

    return {
        "stage": "clean",
        "status": "ok",
        "original_count": result.original_count,
        "valid_count": len(result.records),
        "dropped_empty": result.dropped_empty,
        "dropped_duplicate": result.dropped_duplicate,
        "truncated": result.truncated,
        "masked": result.masked,
        "records": result.records,
    }


# ---- M3 聚类 + 主题命名 ----
@router.post("/cluster")
async def cluster_feedback(body: dict | None = None) -> dict:
    """M3 聚类分析：embedding → 降维 → HDBSCAN（KMeans 降级）→ LLM 主题命名。

    body: {"texts": [str, ...], "min_samples": 5}
    返回：每簇的名称/描述/情感/代表原文/成员索引，及噪声统计。
    """
    from app.core.config import get_settings
    from app.core.llm import get_llm_status
    from app.services.cluster import cluster_texts
    from app.services.insight import analyze_clusters

    texts = (body or {}).get("texts", [])
    if not isinstance(texts, list) or not texts:
        return {"stage": "cluster", "status": "error", "message": "texts 需为非空数组"}

    # 输入条数上限复用 max_rows：聚类全量 embedding/降维，超大请求会拖垮单进程
    max_rows = get_settings().max_rows
    if len(texts) > max_rows:
        return {
            "stage": "cluster",
            "status": "error",
            "message": f"texts 超过 {max_rows} 条上限，请分批或压缩后重试",
        }

    min_samples = (body or {}).get("min_samples")
    outcome = await cluster_texts(texts, min_samples=int(min_samples) if min_samples else None)

    if outcome.method == "degenerate":
        return {"stage": "cluster", "status": "error", "message": "聚类失败：无有效输入"}

    topics = await analyze_clusters(texts, outcome)

    return {
        "stage": "cluster",
        "status": "ok",
        "total": len(texts),
        "n_clusters": outcome.n_clusters,
        "noise_count": outcome.noise_count,
        "method": outcome.method,
        "embed_backend": outcome.embed_backend,
        "silhouette": outcome.silhouette,
        "detail": outcome.detail,
        "topics": topics,
        "llm": get_llm_status(),
    }


# ---- M5 PRD 生成 ----
@router.post("/prd-gen")
async def generate_prd_draft(body: dict | None = None) -> dict:
    """M5 PRD 生成：勾选的主题洞察 → LLM → PRD 草稿（Markdown）。

    body: {"product_name": "xx", "topics": [{name, description, sentiment, size, representative, samples: [str]}]}
    """
    from app.core.llm import get_llm_status
    from app.services.prd import generate_prd

    data = body or {}
    topics = data.get("topics")
    if not isinstance(topics, list) or not topics:
        return {"stage": "prd_gen", "status": "error", "message": "topics 需为非空数组"}

    result = await generate_prd(
        topics,
        product_name=str(data.get("product_name", "")),
    )
    return {**result, "stage": "prd_gen", "llm": get_llm_status()}


# ---- LLM 连通性诊断 ----
@router.get("/llm-ping")
async def llm_ping() -> dict:
    """发起一次最小真实调用，返回实际应答路径与降级状态。

    reply 带 [mock] 前缀 = 当前由离线模式应答（真实调用失败已熔断）。
    """
    from app.core.llm import get_llm, get_llm_status

    llm = get_llm()
    # reasoning 模型思考过程会消耗大量 token，max_tokens 需给足否则正文为空
    reply = await llm.chat(
        [{"role": "user", "content": "连通性测试，只回复：OK"}],
        temperature=0,
        max_tokens=512,
    )
    return {"reply": reply[:160], **get_llm_status()}


# ---- SSE 进度通道（骨架） ----
@router.get("/stream")
async def stream():
    async def gen():
        for stage in PIPELINE_STAGES:
            yield f"event: progress\ndata: {stage}\n\n"
            await asyncio.sleep(0.05)

    from fastapi.responses import StreamingResponse

    return StreamingResponse(gen(), media_type="text/event-stream")