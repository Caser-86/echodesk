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

    def test_concurrent_append_no_corrupt_lines(self, isolated_log):
        """多线程并发追加写不产生坏行（有锁串行化），读回数量与事件数一致。"""
        import threading

        N = 40
        threads = [
            threading.Thread(
                target=lambda: rl.append_event("prd_edited", {"session_id": f"s{i}"})
            )
            for i in range(N)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        events = rl.read_events()
        assert len(events) == N  # 无坏行被静默丢弃

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

    def test_append_rotates_oversized_log_and_keeps_history(self, isolated_log, monkeypatch):
        """超过大小上限时归档旧文件，统计读取仍包含归档事件。"""
        from types import SimpleNamespace

        isolated_log.parent.mkdir(parents=True, exist_ok=True)
        isolated_log.write_text("旧事件\n" + ("x" * 200), encoding="utf-8")
        monkeypatch.setattr(rl, "get_settings", lambda: SimpleNamespace(review_log_max_bytes=20))

        rl.append_event("prd_generated", {"session_id": "s-new"})

        archives = list(isolated_log.parent.glob("review_log.*.jsonl"))
        assert len(archives) == 1
        assert "旧事件" in archives[0].read_text(encoding="utf-8")
        events = rl.read_events()
        assert any(event.get("payload", {}).get("session_id") == "s-new" for event in events)


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
