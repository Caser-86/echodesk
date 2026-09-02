"""M3 聚类与主题命名单元测试。

约定：单测全部在 mock LLM 下运行（不依赖外部凭据）。
mock 的 embedding 是内容哈希伪向量，与语义无关，因此聚类断言只做
结构性验证；语义正确性由 e2e（真实模型）覆盖。
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.cluster import _cluster_vectors, cluster_texts, cluster_members
from app.services.insight import _extract_json, _normalize_topic, name_topic


# ---------- JSON 解析容错 ----------


class TestExtractJson:
    def test_plain_json(self):
        raw = '{"name": "登录卡顿", "description": "d", "sentiment": "negative", "representative": "r"}'
        obj = _extract_json(raw)
        assert obj is not None and obj["name"] == "登录卡顿"

    def test_code_fenced(self):
        raw = '好的，以下是结果：\n```json\n{"name": "导出问题", "sentiment": "neutral"}\n```\n希望有帮助'
        obj = _extract_json(raw)
        assert obj is not None and obj["name"] == "导出问题"

    def test_with_surrounding_text(self):
        raw = '分析完成 {"name": "支付失败", "description": "x", "sentiment": "negative"} 以上'
        obj = _extract_json(raw)
        assert obj is not None and obj["name"] == "支付失败"

    def test_invalid_returns_none(self):
        assert _extract_json("这不是 JSON") is None
        assert _extract_json("[1,2,3]") is None


class TestNormalizeTopic:
    def test_defaults(self):
        out = _normalize_topic({}, samples=["样本A"])
        assert out["name"] == "未命名主题"
        assert out["sentiment"] == "neutral"
        assert out["representative"] == "样本A"

    def test_bad_sentiment_falls_back(self):
        out = _normalize_topic({"sentiment": "超级负面"}, samples=["样本A"])
        assert out["sentiment"] == "neutral"

    def test_representative_must_be_from_samples(self):
        out = _normalize_topic(
            {"name": "n", "representative": "编造的原文不在样本里"}, samples=["真实样本"]
        )
        assert out["representative"] == "真实样本"


# ---------- 聚类降级链路 ----------


class TestClusterVectors:
    def test_three_gaussian_blobs_kmeans(self):
        """三团分离的高斯点应聚出 3 簇（几何可控，不依赖语义）。"""
        rng = np.random.default_rng(42)
        centers = np.array([[0, 0], [10, 10], [-10, 10]])
        pts = np.vstack([c + rng.normal(0, 0.5, (20, 2)) for c in centers])
        outcome = _cluster_vectors(pts, min_samples=5)
        assert outcome.n_clusters == 3
        assert len(outcome.labels) == 60
        # 三团各自内部标签一致且互相不同
        for seg in (0, 1, 2):
            seg_labels = set(outcome.labels[seg * 20 : (seg + 1) * 20])
            assert len(seg_labels) == 1
        assert len({outcome.labels[i] for i in range(0, 60, 20)}) == 3

    def test_hdbscan_unavailable_falls_back_kmeans(self, monkeypatch):
        """强制 hdbscan 不可用 → 必须走 kmeans 且给出降级原因。"""
        from app.services import cluster as cl

        monkeypatch.setitem(cl._avail, "hdbscan", False)
        rng = np.random.default_rng(0)
        pts = np.vstack([c + rng.normal(0, 0.5, (15, 2)) for c in ([0, 0], [8, 8])])
        outcome = cl._cluster_vectors(pts, min_samples=5)
        assert outcome.method == "kmeans"
        assert "降级" in outcome.detail or "未安装" in outcome.detail

    def test_too_few_samples_single_cluster(self):
        outcome = _cluster_vectors(np.zeros((2, 4)), min_samples=5)
        assert outcome.method == "single"
        assert outcome.labels == [0, 0]


# ---------- 管线入口（mock embedding） ----------


class TestClusterTexts:
    def test_empty_input(self):
        import asyncio

        outcome = asyncio.run(cluster_texts([]))
        assert outcome.method == "degenerate"

    def test_structural_invariants(self):
        import asyncio

        texts = [f"用户反馈第 {i} 条内容" for i in range(40)]
        outcome = asyncio.run(cluster_texts(texts))
        assert len(outcome.labels) == 40
        assert all(isinstance(v, int) for v in outcome.labels)
        assert outcome.n_clusters >= 0
        # members 索引完整性：每个索引恰好出现一次
        members = cluster_members(outcome)
        all_idx = sorted(i for idxs in members.values() for i in idxs)
        assert all_idx == list(range(40))


class TestNameTopicMock:
    def test_mock_reply_yields_placeholder(self):
        """mock chat 回复非 JSON → 占位结构且带 parse_error（不中断管线）。"""
        import asyncio

        out = asyncio.run(name_topic(["反馈甲", "反馈乙"]))
        assert "cluster_id" not in out  # name_topic 层不带簇信息
        assert out["name"]
        assert out["representative"] in ("反馈甲", "反馈乙")
        assert "parse_error" in out or "description" in out

    def test_empty_samples(self):
        import asyncio

        out = asyncio.run(name_topic([]))
        assert out["name"] == "空簇"
