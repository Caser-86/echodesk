"""M5 PRD 生成单元测试（mock 模式，离线）。"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.prd import (
    _clean_markdown,
    build_topics_block,
    generate_prd,
    render_prompt,
)


TOPIC = {
    "name": "登录流程故障频发",
    "description": "多种登录方式频繁失败",
    "sentiment": "negative",
    "size": 19,
    "representative": "手机号登录收不到短信验证码",
    "samples": [f"登录问题反馈 {i}" for i in range(15)],
}


class TestBuildTopicsBlock:
    def test_structure_and_sentiment_label(self):
        block = build_topics_block([TOPIC])
        assert "### 主题 1：登录流程故障频发（19 条反馈，负面）" in block
        assert "概述：多种登录方式频繁失败" in block
        assert "「手机号登录收不到短信验证码」" in block
        assert "- 登录问题反馈 0" in block

    def test_samples_capped_at_10(self):
        block = build_topics_block([TOPIC])
        # 15 条样本只保留前 10 条
        assert "- 登录问题反馈 9" in block
        assert "- 登录问题反馈 10" not in block

    def test_multiple_topics_numbered(self):
        block = build_topics_block([TOPIC, {**TOPIC, "name": "导出问题"}])
        assert "### 主题 1：" in block and "### 主题 2：导出问题" in block


class TestRenderPrompt:
    def test_placeholders_filled(self):
        p = render_prompt("EchoDesk", [TOPIC])
        assert "{product_name}" not in p
        assert "{topics_block}" not in p
        assert "EchoDesk" in p
        assert "登录流程故障频发" in p
        # 固定输出结构存在
        assert "## 6. 风险与开放问题" in p


class TestCleanMarkdown:
    def test_strips_code_fence(self):
        raw = "```markdown\n# PRD：测试\n内容\n```"
        assert _clean_markdown(raw) == "# PRD：测试\n内容"

    def test_plain_passes_through(self):
        assert _clean_markdown("  # PRD：x  \n") == "# PRD：x"


class TestGeneratePrdMock:
    def test_empty_topics_rejected(self):
        import asyncio

        r = asyncio.run(generate_prd([]))
        assert r["status"] == "error"

    def test_mock_returns_placeholder_markdown(self):
        """mock chat 回复占位文本 → 草稿带 is_mock 标记，管线不中断。"""
        import asyncio

        r = asyncio.run(generate_prd([TOPIC], product_name="测试产品"))
        assert r["status"] == "ok"
        assert r["n_topics"] == 1
        assert r["total_feedback"] == 19
        assert r["is_mock"] is True
        assert "[mock]" in r["prd_markdown"]
