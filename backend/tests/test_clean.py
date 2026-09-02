"""M2 清洗服务单元测试。

运行：.venv\\Scripts\\python -m pytest backend\\tests\\test_clean.py -v
"""

from app.services.clean import CleanOptions, clean_records


def test_drop_empty_and_blank():
    r = clean_records(["hello", "", "   ", "world"])
    assert r.records == ["hello", "world"]
    assert r.dropped_empty == 2
    assert r.valid_count == 2


def test_dedup_exact_case_insensitive():
    r = clean_records(["应用闪退", "应用闪退", "应用 闪退", "好用"])
    # "应用闪退" 与 "应用 闪退" 规范化后均为"应用闪退"，判重需考虑去空格后比较
    assert r.dropped_duplicate >= 1
    assert "好用" in r.records


def test_truncate_long():
    long_text = "a" * 600
    r = clean_records([long_text], CleanOptions(max_len=100))
    assert len(r.records[0]) == 100
    assert r.truncated == 1


def test_mask_secrets():
    r = clean_records(
        ["联系我13800138000或abc@example.com"],
        CleanOptions(mask_secrets=True),
    )
    assert "[已脱敏]" in r.records[0]
    assert "13800138000" not in r.records[0]
    assert r.masked >= 2


def test_original_and_valid_count():
    r = clean_records(["a", "a", "", "b"])
    assert r.original_count == 4
    assert r.valid_count == 2