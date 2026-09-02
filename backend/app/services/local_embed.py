"""本地语义 embedding：sentence-transformers 优先，TF-IDF 降级，哈希兜底。

背景（v0.2.0，对应迭代日志）：火山 Coding Plan 端点仅提供 chat/completions，
不支持 /embeddings（404）。因此聚类管线的向量化走本地：
  1. sentence-transformers + 中文小模型（默认 BAAI/bge-small-zh-v1.5，约 100MB）
  2. 装不上 / 模型下载失败 → sklearn TF-IDF（char n-gram，中文短文本可用，
     需整批 fit——因此接口约定：一次调用应传入当次聚类的全量文本）
  3. 都失败 → 确定性哈希伪向量（与 MockClient.embed 同构，仅保证管线不断）

全部懒加载：import 本模块不触发 torch / sklearn 初始化。
"""

from __future__ import annotations

import asyncio
import hashlib
import math
import os
from typing import Any

# huggingface_hub 在请求时读取这些变量；导入 st 前设置：
#   HF_HUB_DISABLE_XET 关闭新版 xet 传输（镜像站对 xet/新元数据校验兼容差）
#   注意：不默认设 HF_ENDPOINT=hf-mirror —— 新版 hub(1.29) 对镜像返回的
#   响应头校验严格（FileMetadataError），实测官方源可直连时直接用官方源。
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

from app.core.config import get_settings

_model: Any = None
_model_failed = False


def _load_st_model() -> Any:
    """懒加载 sentence-transformers 模型（全局单例，失败只尝试一次）。"""
    global _model, _model_failed
    if _model is None and not _model_failed:
        try:
            from sentence_transformers import SentenceTransformer

            _model = SentenceTransformer(get_settings().local_embedding_model)
        except Exception:  # noqa: BLE001 —— 下载失败/依赖缺失均走 TF-IDF
            _model_failed = True
    return _model


def _tfidf_vectors(texts: list[str]) -> list[list[float]]:
    """TF-IDF 字符 n-gram 向量（中文无需分词，char_wb (1,2) 对短文本友好）。"""
    from sklearn.feature_extraction.text import TfidfVectorizer

    vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(1, 2), max_features=512)
    m = vec.fit_transform(texts).toarray()
    return [[round(float(v), 6) for v in row] for row in m]


def _hash_vectors(texts: list[str]) -> list[list[float]]:
    """确定性哈希伪向量（与 MockClient.embed 同构，最后兜底）。"""
    out: list[list[float]] = []
    for t in texts:
        seed = int(hashlib.sha256(t.encode("utf-8", errors="ignore")).hexdigest(), 16) % (1 << 32)
        vec = []
        for i in range(64):
            h = hashlib.sha256(f"{seed}:{i}".encode()).digest()
            val = int.from_bytes(h[:4], "big") / (1 << 32)
            vec.append(round(math.sin(val * math.tau) * 0.5 + 0.5, 6))
        out.append(vec)
    return out


async def embed_batch(texts: list[str]) -> tuple[list[list[float]], str]:
    """返回 (向量列表, 实际使用的后端名)。

    后端：sentence_transformers | tfidf | hash
    st 为 CPU 前向推理（阻塞），放入默认线程池避免卡事件循环。
    """
    if not texts:
        return [], "none"

    model = _load_st_model()
    if model is not None:
        loop = asyncio.get_running_loop()
        vecs = await loop.run_in_executor(None, lambda: model.encode(texts).tolist())
        return vecs, "sentence_transformers"

    try:
        return _tfidf_vectors(texts), "tfidf"
    except Exception:  # noqa: BLE001 —— 极端情况（空词典等）
        return _hash_vectors(texts), "hash"
