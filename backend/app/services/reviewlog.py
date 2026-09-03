"""M6 审核日志：记录 PRD 审核环节的关键动作，为「PRD 采纳率」指标积累数据。

设计要点：
- JSONL 事件流（一行一事件），追加写、无锁——单机 MVP 足够，避免为日志引入 DB
- 事件类型：prd_generated / prd_edited / prd_downloaded / export_downloaded
- 统计为纯函数（读事件列表 → 指标），便于单测；IO 与计算分离
- 采纳率定义（docs/03-metrics.md）：下载过 PRD 的生成次数 / 总生成次数
  （proxy：人工"下载"即视为采纳草稿进入下游流程）
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

LOG_PATH = Path(__file__).resolve().parents[2] / "data" / "review_log.jsonl"

EVENT_TYPES = {"prd_generated", "prd_edited", "prd_downloaded", "export_downloaded"}

# 追加写用进程级锁串行化：前端会并发上报生成/编辑/下载事件，
# 无锁时两个 open(...,"a") 的写可能交错，产生坏行被 read_events 静默丢弃（低估统计）。
_append_lock = threading.Lock()


def append_event(event: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """追加一条事件。非法事件类型直接抛 ValueError（调用方即知 bug）。"""
    if event not in EVENT_TYPES:
        raise ValueError(f"未知事件类型 {event}，允许：{sorted(EVENT_TYPES)}")
    record = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "event": event,
        "payload": payload or {},
    }
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _append_lock:
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    return record


def read_events() -> list[dict[str, Any]]:
    """读取全部事件。损坏行（手改文件等）跳过不炸。"""
    if not LOG_PATH.exists():
        return []
    events: list[dict[str, Any]] = []
    for line in LOG_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


def compute_stats(events: list[dict[str, Any]]) -> dict[str, Any]:
    """纯函数：事件列表 → 统计指标。"""
    counts = {e: 0 for e in EVENT_TYPES}
    generated_sessions: set[str] = set()
    downloaded_sessions: set[str] = set()

    for ev in events:
        etype = ev.get("event", "")
        if etype in counts:
            counts[etype] += 1
        # 会话标识用于去重（一次会话内多次编辑只算一次采纳）
        sid = str(ev.get("payload", {}).get("session_id", ""))
        if etype == "prd_generated" and sid:
            generated_sessions.add(sid)
        if etype == "prd_downloaded" and sid:
            downloaded_sessions.add(sid)

    n_gen = counts["prd_generated"]
    # 采纳分子只取「生成过」的会话（防御异常流：下载事件缺对应生成）
    adopted = len(downloaded_sessions & generated_sessions)
    return {
        "total_events": len(events),
        "prd_generated": n_gen,
        "prd_edited": counts["prd_edited"],
        "prd_downloaded": counts["prd_downloaded"],
        "export_downloaded": counts["export_downloaded"],
        # 采纳率：下载过 PRD 的会话 / 有过生成的会话（无生成时为 None 而非 0）
        "adoption_rate": round(adopted / len(generated_sessions), 3)
        if generated_sessions
        else None,
        "log_path": str(LOG_PATH),
    }
