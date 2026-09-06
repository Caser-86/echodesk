# -*- coding: utf-8 -*-
"""浏览器端到端测试（Playwright）。

覆盖核心闭环的 UI 交互：载入示例 → 开始分析 → 生成 PRD → 进入导出。
依赖：前后端已在本机运行（前端 5173 / 后端 8001），且本机有 Edge（复用截图脚本环境）。

运行：
    set E2E=1
    .venv\\Scripts\\python -m pytest e2e/test_ui.py -s --timeout=600

说明：默认（未设 E2E=1）整套用例跳过，保证离线单测秒跑、零凭据可用。
真实链路耗时约 4 分钟（聚类 ~60s + PRD 生成 ~65s × 3 页交互），故显式门控。
"""
import os

import pytest

pytest.importorskip("playwright")

BASE = "http://127.0.0.1:5173"

# 未显式开启 E2E 时整体跳过（默认模块级跳过，避免离线单测被拖慢）
if not os.getenv("E2E"):
    pytest.skip("浏览器 e2e 需显式开启：set E2E=1", allow_module_level=True)

from playwright.sync_api import sync_playwright  # noqa: E402


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        yield browser
        browser.close()


@pytest.fixture(scope="module")
def page(browser):
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.set_default_timeout(280_000)
    yield page
    page.close()


class TestInsightsPipeline:
    def test_load_sample_and_run_analysis(self, page):
        """载入示例数据并开始分析，等主题卡片出现。"""
        page.goto(f"{BASE}/insights")
        page.get_by_role("button", name="载入示例数据").click()
        page.get_by_role("button", name="开始分析").click()
        page.get_by_text("代表原文").first.wait_for(state="visible")
        # 至少渲染一个主题卡片
        assert page.locator("text=代表原文").count() >= 1
        # 勾选主题（为后续 PRD 生成准备）
        boxes = page.get_by_role("checkbox")
        for i in range(boxes.count()):
            boxes.nth(i).check()

    def test_generate_prd(self, page):
        """进入审核页并生成 PRD 草稿。"""
        page.get_by_role("button", name="生成 PRD →").click()
        page.get_by_role("button", name="生成 PRD 草稿").click()
        page.wait_for_function(
            "() => { const t = document.querySelector('textarea');"
            " return t && (t.value.includes('# PRD：') || t.value.includes('[mock]')); }"
        )
        draft = page.locator("textarea").input_value()
        # live 模式返回结构化 Markdown；Docker/CI 的 mock 模式返回可识别占位文本。
        assert "# PRD：" in draft or "[mock]" in draft
        assert draft.strip()

    def test_navigate_to_export(self, page):
        """通过顶部导航进入导出页，验证统计面板存在。"""
        page.get_by_role("link", name="导出").click()
        page.wait_for_load_state("domcontentloaded")
        assert "/export" in page.url
        # 统计面板（PRD 采纳率环形图区域）
        page.get_by_text("审核日志统计").first.wait_for(state="visible")
        assert page.get_by_text("审核日志统计").count() >= 1

    def test_generate_task_cards(self, page):
        """生成 S2 用户故事卡，验证验收标准和来源证据渲染。"""
        page.goto(f"{BASE}/review")
        page.get_by_role("button", name="生成用户故事卡").click()
        page.get_by_text("US-001").first.wait_for(state="visible")
        assert page.get_by_text("验收标准").count() >= 1
        assert page.get_by_text("来源：").count() >= 1

    def test_history_reopens_review_with_task_cards(self, page):
        """S3 历史页可回看会话，并恢复已生成的任务卡。"""
        page.get_by_role("link", name="历史记录").click()
        page.get_by_role("button", name="打开审核").first.wait_for(state="visible")
        page.get_by_role("button", name="打开审核").first.click()
        page.get_by_text("S2 · 用户故事卡").wait_for(state="visible")
        assert page.get_by_text("US-001").count() >= 1
