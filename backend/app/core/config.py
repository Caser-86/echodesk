"""应用配置：从环境变量 / .env 读取。"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]  # backend/
APP_VERSION = "1.1.0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # CORS
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # LLM（OpenAI 兼容接口抽象，可切 DeepSeek / Qwen / GLM / OpenAI）
    llm_provider: str = "openai_compat"  # 备用: "openai", "sentence_transformers"
    llm_mode: str = "auto"  # "auto"|"mock"|"live"：auto=无 key 时自动 mock；mock=强制 mock；live=强制真实
    llm_fallback_mock: bool = True  # live 模式下真实调用失败时自动降级 mock（熔断后续调用）
    llm_model: str = ""
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_max_retries: int = 2
    llm_retry_backoff: float = 2.0  # 指数退避基数（秒）

    # Embedding
    embedding_model: str = "text-embedding-3-small"  # API 模式: OpenAI 兼容 embeddings
    local_embedding_model: str = "BAAI/bge-small-zh-v1.5"  # 本地模式: 中文小模型（约100MB）

    # 存储路径
    data_dir: Path = PROJECT_ROOT / "data"
    uploads_dir: Path = PROJECT_ROOT / "uploads"
    vector_cache_dir: Path = PROJECT_ROOT / "vector_cache"

    # Pipeline 默认参数
    max_rows: int = 5000
    max_text_len: int = 500
    cluster_min_samples: int = 5

    # 审核日志：达到上限后自动归档，避免单个 JSONL 无限增长
    review_log_max_bytes: int = 10 * 1024 * 1024

    def ensure_dirs(self) -> None:
        for d in (self.data_dir, self.uploads_dir, self.vector_cache_dir):
            d.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.ensure_dirs()
    return s
