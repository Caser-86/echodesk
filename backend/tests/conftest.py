"""pytest 全局夹具：保证单测离线、确定、不触发模型下载。

- LLM_MODE=mock：环境变量优先级高于 .env，杜绝单测撞真实 API
- local_embed._model_failed=True：跳过 sentence-transformers 后端，
  单测向量化固定走 TF-IDF（有语义且无需网络/模型文件）
"""

import os

os.environ.setdefault("LLM_MODE", "mock")

import app.services.local_embed as _le  # noqa: E402 —— 必须在设完环境变量后导入

_le._model_failed = True
