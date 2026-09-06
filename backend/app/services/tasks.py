"""S2 任务拆解：把主题洞察转换为可审核的用户故事卡。

任务卡采用确定性模板生成，保证 mock/离线模式也能演示，并保留主题和代表原文作为证据链。
"""

from __future__ import annotations

from typing import Any


def _priority(topic: dict[str, Any]) -> str:
    sentiment = str(topic.get("sentiment", "neutral"))
    size = int(topic.get("size", 0) or 0)
    if sentiment == "negative" and size >= 10:
        return "P0"
    if size >= 5:
        return "P1"
    return "P2"


def build_task_cards(
    topics: list[dict[str, Any]], product_name: str = ""
) -> list[dict[str, Any]]:
    """将主题列表转换成稳定、可追溯的用户故事卡。"""
    if not isinstance(topics, list) or not topics:
        raise ValueError("topics 需为非空数组")

    cards: list[dict[str, Any]] = []
    for index, topic in enumerate(topics, start=1):
        if not isinstance(topic, dict):
            raise ValueError("topics 中每一项需为对象")
        name = str(topic.get("name", "未命名主题")).strip() or "未命名主题"
        description = str(topic.get("description", "")).strip()
        evidence = str(topic.get("representative", "")).strip()
        cards.append(
            {
                "id": f"US-{index:03d}",
                "product_name": product_name or "未命名产品",
                "title": f"优化{name}相关体验",
                "user_story": f"作为产品经理，我希望优化“{name}”相关体验，以便降低反馈中的主要摩擦。",
                "description": description or f"集中处理“{name}”主题下的用户反馈。",
                "acceptance_criteria": [
                    f"用户可完成与“{name}”相关的核心操作，并获得明确结果。",
                    "处理结果与原始反馈记录的问题相匹配，异常情况有清晰提示。",
                    "用户无法自助完成时，页面提供明确的人工处理或后续动作入口。",
                ],
                "priority": _priority(topic),
                "source_topic": name,
                "feedback_count": int(topic.get("size", 0) or 0),
                "evidence": evidence or "暂无代表原文",
            }
        )
    return cards
