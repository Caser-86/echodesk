"""LLM Provider 单元测试：模式解析、降级熔断、指数退避。"""

from unittest.mock import AsyncMock

import httpx
import pytest

from app.core.llm import (
    AuthError,
    FallbackClient,
    LLMError,
    MockClient,
    OpenAICompatClient,
    resolve_mode,
)
from app.core.config import Settings


@pytest.fixture
def no_key_settings():
    return Settings(
        llm_mode="auto",
        llm_api_key="",
        llm_base_url="",
        llm_fallback_mock=True,
    )


@pytest.fixture
def live_settings():
    return Settings(
        llm_mode="live",
        llm_api_key="fake-key",
        llm_base_url="https://example.com/api",
        llm_fallback_mock=True,
        llm_max_retries=1,
    )


def test_resolve_mode_auto_without_key(no_key_settings):
    assert resolve_mode(no_key_settings) == "mock"


def test_resolve_mode_auto_with_key():
    settings = Settings(llm_mode="auto", llm_api_key="x", llm_base_url="https://x.com")
    assert resolve_mode(settings) == "live"


def test_resolve_mode_explicit():
    assert resolve_mode(Settings(llm_mode="mock")) == "mock"
    assert resolve_mode(Settings(llm_mode="live")) == "live"


@pytest.mark.asyncio
async def test_mock_client_chat():
    client = MockClient()
    reply = await client.chat([{"role": "user", "content": "hello"}])
    assert "[mock]" in reply
    assert "hello" in reply


@pytest.mark.asyncio
async def test_mock_client_embed_deterministic():
    client = MockClient()
    a = await client.embed(["text1"])
    b = await client.embed(["text1"])
    assert a == b
    assert len(a[0]) == MockClient.EMBED_DIM


@pytest.mark.asyncio
async def test_openai_client_missing_base_url_raises():
    client = OpenAICompatClient(Settings(llm_api_key="x", llm_base_url=""))
    with pytest.raises(LLMError, match="LLM_BASE_URL"):
        await client.chat([{"role": "user", "content": "hi"}])


@pytest.mark.asyncio
async def test_openai_client_missing_key_raises():
    client = OpenAICompatClient(Settings(llm_base_url="https://x.com", llm_api_key=""))
    with pytest.raises(LLMError, match="LLM_API_KEY"):
        await client.chat([{"role": "user", "content": "hi"}])


def _resp(status: int, text: str) -> httpx.Response:
    return httpx.Response(
        status,
        text=text,
        request=httpx.Request("POST", "https://example.com/api/chat/completions"),
    )


@pytest.mark.asyncio
async def test_openai_client_auth_error(monkeypatch, live_settings):
    client = OpenAICompatClient(live_settings)

    async def fake_post(*args, **kwargs):
        return _resp(401, "Unauthorized")

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    with pytest.raises(AuthError):
        await client.chat([{"role": "user", "content": "hi"}])


@pytest.mark.asyncio
async def test_openai_client_retry_then_fail(monkeypatch, live_settings):
    client = OpenAICompatClient(live_settings)
    call_count = {"n": 0}

    async def fake_post(*args, **kwargs):
        call_count["n"] += 1
        return _resp(500, "Internal Server Error")

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)

    with pytest.raises(LLMError):
        await client.chat([{"role": "user", "content": "hi"}])
    # max_retries=1 means 1 + 1 = 2 attempts
    assert call_count["n"] == 2


@pytest.mark.asyncio
async def test_fallback_degrades_chat_on_llm_error():
    primary = AsyncMock(spec=OpenAICompatClient)
    primary.chat.side_effect = LLMError("boom")
    fallback = MockClient()
    fb = FallbackClient(primary, fallback)

    reply = await fb.chat([{"role": "user", "content": "hi"}])
    assert "[mock]" in reply
    assert fb.degraded is True
    assert "boom" in fb.last_error

    # subsequent calls bypass primary
    reply2 = await fb.chat([{"role": "user", "content": "hi"}])
    assert "[mock]" in reply2
    assert primary.chat.call_count == 1


@pytest.mark.asyncio
async def test_fallback_degrades_embed_on_llm_error():
    primary = AsyncMock(spec=OpenAICompatClient)
    primary.embed.side_effect = LLMError("embed boom")
    fallback = MockClient()
    fb = FallbackClient(primary, fallback)

    vec = await fb.embed(["hello"])
    assert len(vec) == 1
    assert len(vec[0]) == MockClient.EMBED_DIM
    assert fb.embed_degraded is True
    assert "embed boom" in fb.last_embed_error


@pytest.mark.asyncio
async def test_fallback_chat_success_does_not_degrade():
    primary = AsyncMock(spec=OpenAICompatClient)
    primary.chat.return_value = "real answer"
    fallback = MockClient()
    fb = FallbackClient(primary, fallback)

    reply = await fb.chat([{"role": "user", "content": "hi"}])
    assert reply == "real answer"
    assert fb.degraded is False
