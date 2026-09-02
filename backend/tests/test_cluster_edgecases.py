"""聚类服务边界场景测试。"""

import pytest

from app.services.cluster import cluster_texts


@pytest.mark.asyncio
async def test_cluster_empty_input():
    outcome = await cluster_texts([])
    assert outcome.method == "degenerate"
    assert outcome.n_clusters == 0


@pytest.mark.asyncio
async def test_cluster_single_text():
    outcome = await cluster_texts(["只有一条反馈"])
    assert outcome.method == "single"
    assert outcome.n_clusters == 1


@pytest.mark.asyncio
async def test_cluster_all_duplicates():
    outcome = await cluster_texts(["重复文本"] * 6)
    # 去重后的有效样本只有 1 条，应触发 single 路径
    assert outcome.n_clusters == 1


@pytest.mark.asyncio
async def test_cluster_two_unique_texts():
    outcome = await cluster_texts(["a", "b"])
    assert outcome.n_clusters == 1


@pytest.mark.asyncio
async def test_cluster_min_samples_override():
    texts = ["登录很慢"] * 3 + ["导出失败"] * 3
    outcome = await cluster_texts(texts, min_samples=2)
    assert outcome.n_clusters >= 1
    assert outcome.embed_backend != "unknown"
