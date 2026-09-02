"""M3 聚类服务：embedding → 降维 → HDBSCAN（KMeans 降级链路）。

设计（对应产品计划 §6.3）：
  1. embedding：经 LLM 层统一接口（live=真实向量 / mock=确定性伪向量），批量调用
  2. 降维：n≥50 且 umap 可用时 UMAP；否则 sklearn PCA；小样本跳过
  3. 聚类：HDBSCAN 优先（无需预设 K、噪声鲁棒）；
     不可用 / 异常 / 有效簇数<2 时降级 KMeans（K 由轮廓系数在 2..min(10, n//5) 中选优）
  4. 噪声：HDBSCAN 的 -1 簇保留为"未归类"，不强行分配

依赖懒导入：hdbscan / umap 未安装时自动走降级，import 永不失败。
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

import numpy as np

from app.core.config import get_settings
from app.core.llm import get_llm

EMBED_BATCH = 100  # embedding 批大小


@dataclass
class ClusterOutcome:
    labels: list[int]  # 每条文本的簇标签；-1 = 噪声/未归类
    n_clusters: int  # 有效簇数（不含噪声）
    method: str  # "hdbscan" | "kmeans" | "single" | "degenerate"
    noise_count: int  # 噪声条数
    silhouette: float | None  # KMeans 链路附带轮廓系数
    detail: str  # 执行说明（含降级原因）
    embeddings: list[list[float]] = field(default_factory=list, repr=False)
    embed_backend: str = "unknown"  # 实际使用的向量化后端（api/st/tfidf/hash）


# ---------- 依赖可用性探测（模块级缓存） ----------

_avail: dict[str, bool] = {}


def _try_import(name: str) -> bool:
    if name not in _avail:
        try:
            __import__(name)
            _avail[name] = True
        except Exception:
            _avail[name] = False
    return _avail[name]


# ---------- embedding ----------

# 真实 embed API 的进程级状态（自管熔断，避免依赖 FallbackClient 的初始化时序）
_embed_api_state = {"dead": False, "last_error": "", "backend": "unknown"}


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """聚类用向量化：真实 API embedding 优先，失败/不支持时走本地语义模型。

    Coding Plan 类端点常只提供 chat 不提供 /embeddings，因此这里独立处理：
    live 模式下先试真实 embed（分批），任何失败记入熔断（本进程内不再重试），
    之后转 local_embed（sentence-transformers → TF-IDF → 哈希 三级降级）。
    实际使用的后端记录在 _embed_api_state["backend"]，供结果上报。
    """
    from app.core.llm import OpenAICompatClient, resolve_mode

    settings = get_settings()

    if resolve_mode(settings) == "live" and not _embed_api_state["dead"]:
        client = OpenAICompatClient(settings)
        out: list[list[float]] = []
        try:
            for i in range(0, len(texts), EMBED_BATCH):
                out.extend(await client.embed(texts[i : i + EMBED_BATCH]))
            _embed_api_state["backend"] = "api"
            return out
        except Exception as exc:  # noqa: BLE001 —— 任何失败都转本地并熔断
            _embed_api_state["dead"] = True
            _embed_api_state["last_error"] = f"{exc.__class__.__name__}: {exc}"

    from app.services.local_embed import embed_batch

    vectors, backend = await embed_batch(texts)
    _embed_api_state["backend"] = backend
    return vectors


# ---------- 降维 ----------


def reduce_dims(vectors: list[list[float]], n_target: int = 10) -> np.ndarray:
    """UMAP 优先（样本≥50 且已安装），PCA 降级，小样本原样返回。"""
    x = np.asarray(vectors, dtype=np.float64)
    n = x.shape[0]
    if n < 50 or x.shape[1] <= n_target:
        return x

    if _try_import("umap"):
        try:
            import umap

            reducer = umap.UMAP(
                n_components=n_target,
                n_neighbors=min(15, n - 1),
                min_dist=0.0,
                random_state=42,
            )
            return np.asarray(reducer.fit_transform(x), dtype=np.float64)
        except Exception:
            pass  # UMAP 失败 → PCA

    from sklearn.decomposition import PCA

    return np.asarray(PCA(n_components=n_target, random_state=42).fit_transform(x), dtype=np.float64)


# ---------- 聚类 ----------


def _hdbscan_labels(x: np.ndarray, min_samples: int) -> list[int]:
    import hdbscan

    clusterer = hdbscan.HDBSCAN(min_cluster_size=max(3, min_samples), min_samples=min_samples)
    return [int(v) for v in clusterer.fit_predict(x)]


def _kmeans_best(x: np.ndarray) -> tuple[list[int], float]:
    """K 从 2..min(10, n//5) 中选轮廓系数最高者。"""
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score

    n = x.shape[0]
    k_max = max(2, min(10, n // 5))
    best_labels: list[int] = [0] * n
    best_score = -1.0
    for k in range(2, k_max + 1):
        km = KMeans(n_clusters=k, n_init=10, random_state=42)
        labels = km.fit_predict(x)
        # 全部样本必须归入某一簇；轮廓系数需 ≥2 个不同标签
        if len(set(labels)) < 2:
            continue
        score = float(silhouette_score(x, labels))
        if score > best_score:
            best_score = score
            best_labels = [int(v) for v in labels]
    return best_labels, best_score


def _cluster_vectors(x: np.ndarray, min_samples: int) -> ClusterOutcome:
    """对降维后的向量执行聚类，含完整降级链路。"""
    n = x.shape[0]
    if n < 3:
        # 样本过少：无法有效聚类，整体一簇
        return ClusterOutcome(
            labels=[0] * n,
            n_clusters=1 if n else 0,
            method="single",
            noise_count=0,
            silhouette=None,
            detail=f"样本过少(n={n})，整体归为单一簇",
        )

    # 主链路：HDBSCAN
    if _try_import("hdbscan"):
        try:
            labels = _hdbscan_labels(x, min_samples)
            n_valid = len(set(labels) - {-1})
            noise = labels.count(-1)
            if n_valid >= 1 and not (n_valid == 0 and noise == n):
                # 全部被判噪声时也接受（真实数据可能确实无结构），但注明
                detail = f"HDBSCAN: {n_valid} 簇, 噪声 {noise} 条"
                if noise == n:
                    detail = "HDBSCAN: 全部样本判为噪声（数据无明显结构）"
                return ClusterOutcome(
                    labels=labels,
                    n_clusters=n_valid,
                    method="hdbscan",
                    noise_count=noise,
                    silhouette=None,
                    detail=detail,
                )
        except Exception as exc:  # noqa: BLE001 —— 任何 HDBSCAN 异常都降级
            reason = f"HDBSCAN 异常({exc.__class__.__name__})，降级 KMeans"
        else:
            reason = "HDBSCAN 无有效簇，降级 KMeans"
    else:
        reason = "hdbscan 未安装，走 KMeans 链路（降级方案）"

    # 降级链路：KMeans + 轮廓系数
    labels, score = _kmeans_best(x)
    return ClusterOutcome(
        labels=labels,
        n_clusters=len(set(labels)),
        method="kmeans",
        noise_count=0,
        silhouette=round(score, 4) if score > -1 else None,
        detail=f"{reason}: K={len(set(labels))}, 轮廓系数={score:.3f}",
    )


async def cluster_texts(texts: list[str], min_samples: int | None = None) -> ClusterOutcome:
    """完整聚类管线入口：embed → reduce → cluster。"""
    if not texts:
        return ClusterOutcome(labels=[], n_clusters=0, method="degenerate", noise_count=0, silhouette=None, detail="无输入")

    settings = get_settings()
    ms = min_samples if min_samples is not None else settings.cluster_min_samples

    vectors = await embed_texts(texts)
    x = reduce_dims(vectors)
    outcome = _cluster_vectors(x, ms)
    outcome.embeddings = vectors
    outcome.embed_backend = _embed_api_state["backend"]  # embed_texts 记录的真实后端
    return outcome


# ---------- 簇成员索引（供抽样命名/洞察用） ----------


def cluster_members(outcome: ClusterOutcome) -> dict[int, list[int]]:
    """返回 {簇标签: [文本索引...]}，含 -1（噪声）。"""
    members: dict[int, list[int]] = {}
    for idx, label in enumerate(outcome.labels):
        members.setdefault(label, []).append(idx)
    return members
