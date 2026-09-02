"""M6 审核日志 API：事件上报与统计查询。"""

from __future__ import annotations

from fastapi import APIRouter

from app.services.reviewlog import append_event, compute_stats, read_events

router = APIRouter(prefix="/review-log", tags=["review-log"])


@router.post("")
async def log_event(body: dict | None = None) -> dict:
    """上报审核动作。

    body: {"event": "prd_generated|prd_edited|prd_downloaded|export_downloaded",
           "payload": {...}} —— payload 建议带 session_id（采纳率去重键）。
    """
    data = body or {}
    event = str(data.get("event", ""))
    try:
        record = append_event(event, data.get("payload") or {})
    except ValueError as exc:
        return {"stage": "review_log", "status": "error", "message": str(exc)}
    return {"stage": "review_log", "status": "ok", "recorded": record}


@router.get("/stats")
async def get_stats() -> dict:
    """审核统计：各事件计数 + PRD 采纳率（下载会话/生成会话）。"""
    return {"stage": "review_log", "status": "ok", **compute_stats(read_events())}
