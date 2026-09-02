"""M5 PRD 生成：主题洞察 → LLM → 结构化 PRD 草稿（Markdown）。

对应产品计划 §4 的核心卖点「AI 生成 + 人工审核」：
- 生成侧（本模块）：Prompt 强制标注每个需求的来源主题与反馈量（可回溯），
  并在「风险与开放问题」列出需人工确认的决策点。
- 审核侧（前端 Review 页）：人工编辑、还原 AI 原稿、导出。

Prompt 版本化存放于 app/prompts/prd/generation.txt（§6.4 管理原则）。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.core.llm import get_llm

PROMPT_PATH = Path(__file__).resolve().parents[1] / "prompts" / "prd" / "generation.txt"

MAX_SAMPLES_PER_TOPIC = 10  # 每主题进 Prompt 的反馈摘录上限（控制 token）
PRD_MAX_TOKENS = 16384  # 长文输出上限（reasoning 模型思考会消耗配额，需给足）
PRD_TIMEOUT = 300.0  # 长输出请求超时（秒），独立于普通对话的 120s


def load_prompt() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8")


def build_topics_block(topics: list[dict[str, Any]]) -> str:
    """把主题洞察渲染为 Prompt 中的结构化文本块（纯函数，便于单测）。

    topics 每项：{name, description, sentiment, size, samples: [str]}
    """
    parts: list[str] = []
    for i, t in enumerate(topics, 1):
        sentiment = {"negative": "负面", "neutral": "中性", "positive": "正面"}.get(
            str(t.get("sentiment", "neutral")), "中性"
        )
        lines = [
            f"### 主题 {i}：{t.get('name', '未命名')}（{t.get('size', '?')} 条反馈，{sentiment}）",
            f"概述：{t.get('description', '')}",
            f"代表原文：「{t.get('representative', '')}」",
            "反馈摘录：",
        ]
        samples = [str(s) for s in t.get("samples", [])][:MAX_SAMPLES_PER_TOPIC]
        lines.extend(f"- {s}" for s in samples)
        parts.append("\n".join(lines))
    return "\n\n".join(parts)


def render_prompt(product_name: str, topics: list[dict[str, Any]]) -> str:
    """组装最终 Prompt。占位符用 replace（prompt 内含 Markdown 结构，不能用 format）。"""
    return (
        load_prompt()
        .replace("{product_name}", product_name or "未命名产品")
        .replace("{topics_block}", build_topics_block(topics))
    )


def _clean_markdown(reply: str) -> str:
    """容错：剥离模型偶发的整体代码块包裹与前后杂文。"""
    text = reply.strip()
    if text.startswith("```"):
        first_nl = text.find("\n")
        if first_nl != -1 and text.rstrip().endswith("```"):
            text = text[first_nl + 1 : text.rstrip().rfind("```")]
    return text.strip()


async def generate_prd(
    topics: list[dict[str, Any]], product_name: str = ""
) -> dict[str, Any]:
    """生成 PRD 草稿。空主题直接拒绝；LLM 异常向上抛（由 API 层转为错误响应）。"""
    if not topics:
        return {"status": "error", "message": "未提供任何主题，无法生成 PRD"}

    prompt = render_prompt(product_name, topics)
    llm = get_llm()
    # reasoning_effort=low：结构化写作任务无需深思考。实测（方舟 glm-5-3-flash）
    # 默认思考会耗尽 8192 token 配额导致正文为空；low 档 reasoning_tokens=0，
    # 耗时/成本约 1/4，PRD 质量无损。注意：thinking.type=disabled/auto 该模型不支持。
    reply = await llm.chat(
        [{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=PRD_MAX_TOKENS,
        timeout=PRD_TIMEOUT,
        reasoning_effort="low",
    )
    markdown = _clean_markdown(reply)

    return {
        "status": "ok",
        "product_name": product_name or "未命名产品",
        "n_topics": len(topics),
        "total_feedback": sum(int(t.get("size", 0)) for t in topics),
        "prd_markdown": markdown,
        "is_mock": markdown.startswith("[mock]"),
    }
