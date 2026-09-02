"""LLM Provider 抽象层。

统一封装 OpenAI 兼容接口的 chat/completions 与 embeddings 调用，内置指数退避重试。
通过 llm_mode 控制运行模式：
  live  强制走真实 API（LLM_BASE_URL / LLM_API_KEY 必填）
  mock  强制走内置 Mock，不发起任何外部请求（开发/CI/无 key 演示用）
  auto  无 key 时自动落到 mock，避免管线因缺凭据而中断

降级策略（llm_fallback_mock=true 且 live 模式）：
  真实调用发生不可恢复错误（含 401/403 鉴权拒绝）时，自动降级到 Mock 并熔断
  后续对真实 API 的尝试，保证管线始终可用。key 生效后重启服务即恢复 live。

真实 Provider 可快速切换 DeepSeek / Qwen / GLM(智谱/方舟) / OpenAI 等。
"""

from __future__ import annotations

import asyncio
import hashlib
import math
from typing import Any, Protocol

import httpx

from app.core.config import Settings, get_settings


class LLMError(Exception):
    """LLM 调用不可恢复错误（真实模式下为重试耗尽或被拒绝）。"""


class AuthError(LLMError):
    """鉴权被拒（HTTP 401/403）：key 被服务商拒绝，重试无意义。"""


class ChatClient(Protocol):
    async def chat(self, messages: list[dict[str, str]], **kwargs: Any) -> str: ...
    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class OpenAICompatClient:
    """基于 httpx 的 OpenAI 兼容 Chat/Embedding 客户端（真实模式）。"""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    @property
    def _base_url(self) -> str:
        if not self.settings.llm_base_url:
            raise LLMError("未配置 LLM_BASE_URL（请在 .env 或环境变量中填写）")
        return self.settings.llm_base_url.rstrip("/")

    def _headers(self) -> dict[str, str]:
        if not self.settings.llm_api_key:
            raise LLMError("未配置 LLM_API_KEY（请在 .env 或环境变量中填写）")
        return {
            "Authorization": f"Bearer {self.settings.llm_api_key}",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _check_auth(resp: httpx.Response) -> None:
        """401/403 直接判为鉴权失败，不做无意义重试。"""
        if resp.status_code in (401, 403):
            detail = resp.text[:200]
            raise AuthError(f"鉴权被拒（HTTP {resp.status_code}）：{detail}")

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        timeout: float = 120.0,
        **kwargs: Any,
    ) -> str:
        """调用 chat/completions，返回首条文本。带指数退避重试（鉴权错误除外）。

        timeout 独立于 payload 之外的请求超时（长输出场景如 PRD 生成可调大）。
        """
        model = self.settings.llm_model or "gpt-4o-mini"
        payload = {"model": model, "messages": messages, **kwargs}

        attempts = self.settings.llm_max_retries + 1
        for attempt in range(attempts):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    resp = await client.post(
                        f"{self._base_url}/chat/completions",
                        headers=self._headers(),
                        json=payload,
                    )
                self._check_auth(resp)
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"].strip()
            except AuthError:
                raise  # 鉴权失败不重试
            except (httpx.HTTPError, KeyError) as exc:
                if attempt == attempts - 1:
                    raise LLMError(f"LLM 调用失败：{exc}") from exc
                backoff = self.settings.llm_retry_backoff ** attempt
                await asyncio.sleep(min(backoff, 8.0))
        raise LLMError("LLM 调用达到最大重试次数")

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """调用 embeddings，返回向量列表。"""
        payload = {"model": self.settings.embedding_model, "input": texts}
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    f"{self._base_url}/embeddings",
                    headers=self._headers(),
                    json=payload,
                )
            self._check_auth(resp)
            resp.raise_for_status()
            data = resp.json()
            return [item["embedding"] for item in data["data"]]
        except AuthError:
            raise
        except (httpx.HTTPError, KeyError) as exc:
            raise LLMError(f"Embedding 调用失败：{exc}") from exc


class MockClient:
    """离线 Mock 实现：返回确定性的伪结果，保证管线在无凭据时也能端到端运行。

    - embed：基于文本内容哈希生成确定性伪向量（尺寸 64），聚类/降维可正常消费。
    - chat：依据最后一条 user content 的关键词，返回结构化占位文本。
    """

    EMBED_DIM = 64

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    async def chat(self, messages: list[dict[str, str]], **kwargs: Any) -> str:
        user_content = ""
        for m in reversed(messages):
            if m["role"] == "user":
                user_content = m.get("content", "")
                break
        return self._mock_reply(user_content)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for t in texts:
            # 确定性伪向量：由文本哈希播种
            seed = int(hashlib.sha256(t.encode("utf-8", errors="ignore")).hexdigest(), 16) % (1 << 32)
            vec = []
            for i in range(self.EMBED_DIM):
                h = hashlib.sha256(f"{seed}:{i}".encode()).digest()
                val = int.from_bytes(h[:4], "big") / (1 << 32)
                vec.append(round(math.sin(val * math.tau) * 0.5 + 0.5, 6))
            out.append(vec)
        return out

    @staticmethod
    def _mock_reply(user_content: str) -> str:
        u = user_content[:200]
        # 单行、无引号，方便前端直接落入占位文本区
        return (
            "[mock] 主题命名/情感/PRD 的占位输出。输入片段：'"
            f"{' '.join(u.split())}'。配置真实 LLM_API_KEY 并设 LLM_MODE=live 后替换为模型输出。"
        )


class FallbackClient:
    """首选真实 API，失败自动降级到 Mock，并对后续调用熔断。

    - 真实调用抛出任意 LLMError（含 AuthError）时：记录原因、置 degraded，
      本调用及后续调用直接走 Mock，避免每次请求都等真实端超时/重试。
    - chat 与 embed 熔断相互独立：常见场景是订阅类端点（如 Coding Plan）
      只支持 chat 不支持 embeddings，此时命名走真实模型、向量化走本地。
    - 服务重启后熔断状态清零：key 修复后无需改代码即恢复 live。
    """

    def __init__(self, primary: OpenAICompatClient, fallback: MockClient) -> None:
        self.primary = primary
        self.fallback = fallback
        self.degraded = False  # chat 熔断
        self.embed_degraded = False  # embeddings 熔断（独立）
        self.last_error = ""
        self.last_embed_error = ""

    async def chat(self, messages: list[dict[str, str]], **kwargs: Any) -> str:
        if not self.degraded:
            try:
                return await self.primary.chat(messages, **kwargs)
            except LLMError as exc:
                self.degraded = True
                self.last_error = f"{exc.__class__.__name__}: {exc}"
        return await self.fallback.chat(messages, **kwargs)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not self.embed_degraded:
            try:
                return await self.primary.embed(texts)
            except LLMError as exc:
                self.embed_degraded = True
                self.last_embed_error = f"{exc.__class__.__name__}: {exc}"
        return await self.fallback.embed(texts)


_mock: MockClient | None = None
_live: OpenAICompatClient | None = None
_fallback: FallbackClient | None = None


def resolve_mode(settings: Settings) -> str:
    """根据 llm_mode 与是否具备 key，决定当前实际运行模式。"""
    mode = settings.llm_mode
    if mode in ("live", "mock"):
        return mode
    # auto：有 key 则 live，否则 mock
    return "live" if settings.llm_api_key else "mock"


def get_llm() -> ChatClient:
    settings = get_settings()
    if resolve_mode(settings) == "mock":
        global _mock
        if _mock is None:
            _mock = MockClient(settings)
        return _mock
    if settings.llm_fallback_mock:
        global _fallback
        if _fallback is None:
            _fallback = FallbackClient(OpenAICompatClient(settings), MockClient(settings))
        return _fallback
    global _live
    if _live is None:
        _live = OpenAICompatClient(settings)
    return _live


def get_llm_status() -> dict:
    """当前 LLM 运行状态（供 health/llm-ping 上报）。"""
    s = get_settings()
    mode = resolve_mode(s)
    fb = _fallback
    return {
        "llm_mode": mode,
        "fallback_enabled": bool(s.llm_fallback_mock and mode == "live"),
        "degraded": bool(fb is not None and fb.degraded),
        "last_error": (fb.last_error if fb is not None else "")[:200],
        "embed_degraded": bool(fb is not None and fb.embed_degraded),
        "last_embed_error": (fb.last_embed_error if fb is not None else "")[:200],
    }