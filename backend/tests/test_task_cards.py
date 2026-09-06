"""S2 用户故事卡：主题洞察到结构化任务拆解。"""

import pytest


def test_build_task_cards_keeps_topic_traceability():
    from app.services.tasks import build_task_cards

    cards = build_task_cards(
        [
            {
                "name": "登录体验",
                "description": "登录失败和等待时间较长",
                "sentiment": "negative",
                "size": 20,
                "representative": "手机号登录收不到验证码",
            }
        ],
        product_name="FlowDesk",
    )

    assert len(cards) == 1
    card = cards[0]
    assert card["id"] == "US-001"
    assert card["source_topic"] == "登录体验"
    assert card["evidence"] == "手机号登录收不到验证码"
    assert card["priority"] in {"P0", "P1", "P2"}
    assert card["user_story"].startswith("作为")
    assert len(card["acceptance_criteria"]) >= 3


def test_build_task_cards_rejects_empty_topics():
    from app.services.tasks import build_task_cards

    with pytest.raises(ValueError, match="topics"):
        build_task_cards([])
