"""M6 审核日志单元测试（monkeypatch 隔离 LOG_PATH，不污染真实数据）。"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.services.reviewlog as rl


@pytest.fixture()
def isolated_log(tmp_path, monkeypatch):
    monkeypatch.setattr(rl, "LOG_PATH", tmp_path / "review_log.jsonl")
    return rl.LOG_PATH


class TestAppendAndRead:
    def test_append_then_read(self, isolated_log):
        rec = rl.append_event("prd_generated", {"session_id": "s1", "n_topics": 3})
        assert rec["event"] == "prd_generated"
        assert rec["payload"] == {"session_id": "s1", "n_topics": 3}
        assert isolated_log.exists()
        events = rl.read_events()
        assert len(events) == 1 and events[0]["event"] == "prd_generated"

    def test_unknown_event_rejected(self, isolated_log):
        with pytest.raises(ValueError, match="未知事件类型"):
            rl.append_event("prd_deleted")

    def test_missing_file_reads_empty(self, isolated_log):
        assert rl.read_events() == []

    def test_corrupt_line_skipped(self, isolated_log):
        isolated_log.parent.mkdir(parents=True, exist_ok=True)
        isolated_log.write_text(
            '{"event": "prd_generated", "payload": {}}\n'
            "不是JSON\n"
            "\n"
            '{"event": "prd_edited", "payload": {}}\n',
            encoding="utf-8",
        )
        assert len(rl.read_events()) == 2


class TestComputeStats:
    def test_empty(self):
        s = rl.compute_stats([])
        assert s["prd_generated"] == 0
        assert s["adoption_rate"] is None  # 无生成时为 None 而非 0

    def test_adoption_rate_dedup_by_session(self):
        """同一会话生成 1 次 + 编辑 3 次 + 下载 1 次 → 采纳率 1.0（编辑不去重影响）。"""
        events = (
            [{"event": "prd_generated", "payload": {"session_id": "s1"}}]
            + [{"event": "prd_edited", "payload": {"session_id": "s1"}}] * 3
            + [{"event": "prd_downloaded", "payload": {"session_id": "s1"}}]
        )
        s = rl.compute_stats(events)
        assert s["prd_generated"] == 1
        assert s["prd_edited"] == 3
        assert s["prd_downloaded"] == 1
        assert s["adoption_rate"] == 1.0

    def test_partial_adoption(self):
        """两个会话各有生成，只有一个下载 → 0.5。"""
        events = [
            {"event": "prd_generated", "payload": {"session_id": "s1"}},
            {"event": "prd_generated", "payload": {"session_id": "s2"}},
            {"event": "prd_downloaded", "payload": {"session_id": "s1"}},
        ]
        assert rl.compute_stats(events)["adoption_rate"] == 0.5

    def test_download_without_generation_not_counted(self):
        """下载事件缺少生成对应（异常流）→ 分母不含该会话。"""
        events = [
            {"event": "prd_generated", "payload": {"session_id": "s1"}},
            {"event": "prd_downloaded", "payload": {"session_id": "ghost"}},
        ]
        assert rl.compute_stats(events)["adoption_rate"] == 0.0

    def test_events_without_session_id(self):
        """无 session_id 的事件计入计数但不进采纳率集合。"""
        events = [{"event": "prd_generated", "payload": {}}]
        s = rl.compute_stats(events)
        assert s["prd_generated"] == 1
        assert s["adoption_rate"] is None
