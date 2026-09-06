"""健康检查与供应商握手信息。"""

from fastapi import APIRouter

from app.core.config import APP_VERSION, get_settings
from app.core.llm import get_llm_status

router = APIRouter(tags=["system"])


@router.get("/health")
def health() -> dict:
    settings = get_settings()
    status = get_llm_status()
    return {
        "status": "ok",
        "version": APP_VERSION,
        # llm_mode: live=首选真实 / mock=离线；degraded=true 表示真实调用已被降级
        **status,
        "llm_provider": settings.llm_provider,
        "llm_model": settings.llm_model or "未配置（.env 未填）",
    }
