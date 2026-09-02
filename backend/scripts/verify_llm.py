"""LLM 配置一键验证脚本。

用法（在 backend/ 目录下）：
    .venv\\Scripts\\python scripts\\verify_llm.py [model_name]

不传 model_name 时，依次尝试候选列表；也可以直接传入你在方舟看到的
接入点 ID / 模型名。命中后会把可用标识打印出来，用于回填 .env 的 LLM_MODEL。
"""

import asyncio
import sys
from pathlib import Path

# 确保能导入 app 包（backend 根目录）
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.core.llm import LLMError, get_llm

# 候选：约 9 成概率能直接命中，未命中则由方舟错误提示进一步定位
CANDIDATES = [
    "glm-5.3-flash",
    "glm-5-flash",
    "glm-4-flash",
]

# 若想嵌入向量也用同一个 key 验证，取消注释下一行并按实际名填
# EMBEDDING_CANDIDATES = ["doubao-embedding", "doubao-embedding-large-text-240715"]


async def main() -> None:
    s = get_settings()
    llm = get_llm()

    override = sys.argv[1] if len(sys.argv) > 1 else None
    models = [override] if override else ([s.llm_model] if s.llm_model else [])
    models = [m for m in models if m] or list(CANDIDATES)

    for m in models:
        s.llm_model = m  # 命中后改实例字段即可由 get_llm 使用
        print(f"--- 尝试 model: {m}")
        try:
            result = await llm.chat(
                [{"role": "user", "content": "只回复两个字母：OK"}],
                temperature=0,
                max_tokens=16,
            )
            print(f"成功  >>> 可用接入点 = {m}")
            print(f"返回内容: {result}")
            print(f"\n请将以下值写入 backend/.env: LLM_MODEL={m}")
            return
        except LLMError as exc:
            print(f"失败  : {exc}")
        print()

    print("候选均未命中。请查看上面各次失败的服务端错误提示中的可用 model / 接入点ID，然后运行:")
    print("    .venv\\Scripts\\python scripts\\verify_llm.py <你方舟里的完整model/接入点ID>")


if __name__ == "__main__":
    asyncio.run(main())