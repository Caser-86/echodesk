"""打印火山方舟对指定请求的完整响应体，定位 401 等鉴权/开通问题的精确原因。

用法：.venv\\Scripts\\python scripts\\diag_ark.py [model]
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from app.core.config import get_settings

BASE = ["https://ark.cn-beijing.volces.com/api/v3", "https://ark.cn-guangzhou.volces.com/api/v3", "https://ark.ap-southeast-1.volces.com/api/v3", "https://maas.volcengine.com/api/v3"]


async def main() -> None:
    s = get_settings()
    model = sys.argv[1] if len(sys.argv) > 1 else "glm-5.3-flash"
    for base in BASE:
        url = f"{base}/chat/completions"
        for header in (f"Bearer {s.llm_api_key}", s.llm_api_key):
            try:
                async with httpx.AsyncClient(timeout=15.0) as c:
                    r = await c.post(
                        url,
                        headers={"Authorization": header, "Content-Type": "application/json"},
                        json={"model": model, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 4},
                    )
                print(f"=== {base} | auth=Bearer|bare | HTTP {r.status_code}")
                print("    body:", r.text[:500])
            except httpx.HTTPError as e:
                print(f"=== {base} | 请求异常: {e.__class__.__name__} {e}")
            print()


if __name__ == "__main__":
    asyncio.run(main())