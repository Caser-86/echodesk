# -*- coding: utf-8 -*-
"""演示截图生成：洞察页（分析结果）+ PRD 审核页（生成草稿）。

用法：前后端运行中执行 `python scripts/take_screenshots.py`，
输出到 docs/screenshots/（README 引用）。UI 变更后可重跑刷新截图。
依赖：pip install playwright（用本机 Edge，无需下载浏览器）。
真实链路耗时约 2 分钟（聚类 ~60s + PRD 生成 ~65s）。
"""
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:5173"
OUT = Path(__file__).resolve().parents[2] / "docs" / "screenshots"


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="msedge", headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 800})
        page.set_default_timeout(240_000)

        # ---- 截图 1：洞察页分析结果（整页） ----
        await page.goto(f"{BASE}/insights")
        await page.get_by_role("button", name="载入示例数据").click()
        await page.get_by_role("button", name="开始分析").click()
        # 等主题卡片渲染完成（聚类 + LLM 命名，真实链路约 60s）
        await page.get_by_text("代表原文").first.wait_for(state="visible")
        # 勾选全部三个主题（供截图 2 使用）
        boxes = page.get_by_role("checkbox")
        for i in range(await boxes.count()):
            await boxes.nth(i).check()
        await page.screenshot(path=str(OUT / "insights.png"), full_page=True)
        print("[1/2] insights.png saved")

        # ---- 截图 2：PRD 审核页（生成后的草稿） ----
        await page.get_by_role("button", name="生成 PRD →").click()
        await page.get_by_role("button", name="生成 PRD 草稿").click()
        # 等 PRD 生成完成（真实 LLM 约 65s）：textarea 非空且非占位
        await page.wait_for_function(
            "() => { const t = document.querySelector('textarea');"
            " return t && t.value.includes('# PRD：'); }"
        )
        await page.screenshot(path=str(OUT / "review.png"), full_page=True)
        print("[2/2] review.png saved")

        await browser.close()

    for f in ("insights.png", "review.png"):
        pth = OUT / f
        print(f"{f}: {pth.stat().st_size // 1024} KB" if pth.exists() else f"{f}: MISSING")


asyncio.run(main())
