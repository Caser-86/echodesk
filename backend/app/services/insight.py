"""M3 簇主题命名：抽样 → LLM → 结构化 JSON（解析容错）。

对应产品计划 §6.3 的"主题命名 + 痛点提炼"环节与 §6.4 Prompt 管理原则：
Prompt 以文件形式版本化存放于 app/prompts/cluster/topic_naming.txt。
"""

from __future__ import annotations

import asyncio
import json
import random
import re
from pathlib import Path
from typing import Any

from app.core.llm import get_llm
from app.services.cluster import ClusterOutcome, cluster_members

PROMPT_PATH = Path(__file__).resolve().parents[1] / "prompts" / "cluster" / "topic_naming.txt"
MAX_SAMPLES_PER_CLUSTER = 15  # 每簇抽样上限（控制 token 成本）
NAMING_CONCURRENCY = 3  # 并发命名数（避免打爆真实 API）


def load_prompt() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8")


def _extract_json(text: str) -> dict[str, Any] | None:
    """从 LLM 回复中提取 JSON 对象，容错处理代码块包裹/前后杂文。"""
    # 优先取 ```json ... ``` 代码块
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidates = [m.group(1)] if m else []
    # 退化：首个平衡的大括号段
    m2 = re.search(r"\{.*\}", text, re.DOTALL)
    if m2:
        candidates.append(m2.group(0))
    for cand in candidates:
        try:
            obj = json.loads(cand)
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            continue
    return None


def _normalize_topic(raw: dict[str, Any], samples: list[str]) -> dict[str, Any]:
    """字段校验与兜底：保证前端拿到的结构完整。"""
    sentiment = str(raw.get("sentiment", "neutral")).lower()
    if sentiment not in ("positive", "neutral", "negative"):
        sentiment = "neutral"
    representative = str(raw.get("representative", "")).strip()
    if representative not in samples:
        representative = samples[0] if samples else ""
    return {
        "name": str(raw.get("name", "未命名主题"))[:30] or "未命名主题",
        "description": str(raw.get("description", ""))[:120],
        "sentiment": sentiment,
        "representative": representative,
    }


async def name_topic(samples: list[str]) -> dict[str, Any]:
    """对单个簇的抽样文本调用 LLM 命名。解析失败返回占位结构（不中断管线）。"""
    if not samples:
        return {"name": "空簇", "description": "", "sentiment": "neutral", "representative": ""}

    # 注意：prompt 内含 JSON 示例的大括号，不能用 str.format，用 replace
    prompt = load_prompt().replace("{samples}", "\n".join(f"- {s}" for s in samples))
    llm = get_llm()
    # reasoning 模型思考消耗大：1024 会被思考吃光导致正文为空（实测），给足 4096
    reply = await llm.chat(
        [{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=4096,
    )

    raw = _extract_json(reply)
    if raw is None:
        # mock 模式回复非 JSON；真实模式偶发格式漂移。均降级为占位命名。
        snippet = samples[0][:40]
        return {
            "name": f"主题（{len(samples)} 条）",
            "description": f"LLM 输出未能解析为 JSON，摘录：{snippet}",
            "sentiment": "neutral",
            "representative": samples[0],
            "parse_error": reply[:200],
        }
    return _normalize_topic(raw, samples)


async def analyze_clusters(texts: list[str], outcome: ClusterOutcome) -> list[dict[str, Any]]:
    """对所有有效簇执行主题命名（并发受控），返回簇洞察列表（按簇大小降序）。"""
    members = cluster_members(outcome)
    clusters = [(label, idxs) for label, idxs in members.items() if label != -1 and len(idxs) >= 2]
    clusters.sort(key=lambda kv: len(kv[1]), reverse=True)

    sem = asyncio.Semaphore(NAMING_CONCURRENCY)

    async def _one(label: int, idxs: list[int]) -> dict[str, Any]:
        rng = random.Random(42 + label)  # 抽样可复现
        picked = rng.sample(idxs, min(MAX_SAMPLES_PER_CLUSTER, len(idxs)))
        samples = [texts[i] for i in picked]
        async with sem:
            topic = await name_topic(samples)
        return {
            "cluster_id": label,
            "size": len(idxs),
            "member_indices": idxs,
            **topic,
        }

    return await asyncio.gather(*(_one(label, idxs) for label, idxs in clusters))
