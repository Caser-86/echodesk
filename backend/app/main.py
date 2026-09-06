"""EchoDesk 后端入口。

启动：
    cd backend
    uvicorn app.main:app --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health, pipeline, reviewlog
from app.core.config import APP_VERSION, get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="EchoDesk API",
        description="AI 需求工作台后端：反馈导入 → 清洗 → 聚类 → 洞察 → PRD 草稿 → 人工审核 → 导出",
        version=APP_VERSION,
    )

    # 开发期允许前端(5173)跨域调用；生产由反向代理收敛
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router, prefix="/api")
    app.include_router(pipeline.router, prefix="/api")
    app.include_router(reviewlog.router, prefix="/api")

    return app


app = create_app()
