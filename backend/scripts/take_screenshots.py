# -*- coding: utf-8 -*-
"""演示截图生成：洞察页（分析结果）+ PRD 审核页（生成草稿）。

用法：前后端运行中执行 `python scripts/take_screenshots.py`，
输出到 docs/screenshots/（README 引用）。UI 变更后可重跑刷新截图。
依赖：pip install playwright（用本机 Edge，无需下载浏览器）。
真实链路耗时约 4 分钟（聚类 ~60s + PRD 生成 ~65s，× 明暗两套）。
"""
import asyncio
from pathlib import Path

from playwright.async_api import async_playwright, Page

BASE = "http://127.0.0.1:5173"
OUT = Path(__file__).resolve().parents[2] / "docs" / "screenshots"


async def wait_for_insights(page: Page) -> None:
    await page.goto(f"{BASE}/insights")
    await page.get_by_role("button", name="载入示例数据").click()
    await page.get_by_role("button", name="开始分析").click()
    # 等主题卡片渲染完成（聚类 + LLM 命名，真实链路约 60s）
    await page.get_by_text("代表原文").first.wait_for(state="visible")
    # 勾选全部三个主题（供截图 2 使用）
    boxes = page.get_by_role("checkbox")
    for i in range(await boxes.count()):
        await boxes.nth(i).check()


async def wait_for_review(page: Page) -> None:
    await page.get_by_role("button", name="生成 PRD →").click()
    await page.get_by_role("button", name="生成 PRD 草稿").click()
    # 等 PRD 生成完成（真实 LLM 约 65s）：textarea 非空且非占位
    await page.wait_for_function(
        "() => { const t = document.querySelector('textarea');"
        " return t && t.value.includes('# PRD：'); }"
    )


async def set_theme(page: Page, theme: str) -> None:
    await page.goto(BASE)
    await page.evaluate(f"() => {{ localStorage.setItem('echodesk:theme', '{theme}'); }}")


async def capture(browser, theme: str) -> None:
    page = await browser.new_page(viewport={"width": 1280, "height": 800})
    page.set_default_timeout(240_000)

    await set_theme(page, theme)
    await wait_for_insights(page)
    suffix = "" if theme == "light" else "-dark"
    await page.screenshot(path=str(OUT / f"insights{suffix}.png"), full_page=True)
    print(f"[1/2] insights{suffix}.png saved")

    await wait_for_review(page)
    await page.screenshot(path=str(OUT / f"review{suffix}.png"), full_page=True)
    print(f"[2/2] review{suffix}.png saved")

    await page.close()


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="msedge", headless=True)

        for theme in ("light", "dark"):
            print(f"\nCapturing {theme} mode...")
            await capture(browser, theme)

        await browser.close()

    for f in ("insights.png", "review.png", "insights-dark.png", "review-dark.png"):
        pth = OUT / f
        print(f"{f}: {pth.stat().st_size // 1024} KB" if pth.exists() else f"{f}: MISSING")


asyncio.run(main())
