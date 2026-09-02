"""M1 数据导入单元测试（纯函数，离线）。"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.ingest import parse_upload


class TestCsv:
    def test_utf8_bom_with_header(self):
        """Excel 导出的 CSV（带 BOM）：表头不应残留 ﻿ 字符。"""
        content = "用户,反馈\n张三,登录很慢\n李四,导出乱码\n"
        data = b"\xef\xbb\xbf" + content.encode("utf-8")
        r = parse_upload("f.csv", data, has_header=True)
        assert r.status == "ok"
        assert r.columns == ["用户", "反馈"]
        assert r.n_rows == 2 and r.rows[0] == ["张三", "登录很慢"]

    def test_gbk_encoding(self):
        """GBK 编码的中文 CSV（中文 Windows 记事本默认）。"""
        content = "反馈内容\n登录页面卡死\n客服不回复\n"
        r = parse_upload("f.csv", content.encode("gbk"), has_header=True)
        assert r.status == "ok"
        assert r.columns == ["反馈内容"]
        assert r.rows == [["登录页面卡死"], ["客服不回复"]]

    def test_no_header(self):
        r = parse_upload("f.csv", "登录很慢\n导出乱码\n".encode("utf-8"), has_header=False)
        assert r.status == "ok"
        assert r.columns == ["第1列"]
        assert r.n_rows == 2

    def test_blank_lines_skipped(self):
        r = parse_upload("f.csv", "a\n\n\nb\n".encode(), has_header=False)
        assert r.n_rows == 2

    def test_empty_file(self):
        r = parse_upload("f.csv", b"", has_header=False)
        assert r.status == "error"

    def test_truncated_to_max_rows(self, monkeypatch):
        from app.core.config import get_settings

        monkeypatch.setattr(get_settings(), "max_rows", 3)
        data = "\n".join(f"反馈{i}" for i in range(10)).encode()
        r = parse_upload("f.csv", data, has_header=False)
        assert r.truncated is True
        assert r.n_rows == 10  # 原始行数如实上报
        assert len(r.rows) == 3  # 返回被截断


class TestXlsx:
    def test_basic(self):
        import io

        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.append(["用户", "反馈"])
        ws.append(["张三", "登录很慢"])
        ws.append(["李四", None])  # None → 空串；该行仍有效（第一列有值）
        buf = io.BytesIO()
        wb.save(buf)
        r = parse_upload("f.xlsx", buf.getvalue(), has_header=True)
        assert r.status == "ok"
        assert r.columns == ["用户", "反馈"]
        assert r.n_rows == 2
        assert r.rows[1] == ["李四", ""]


class TestTxt:
    def test_lines_single_column(self):
        r = parse_upload("f.txt", "登录很慢\r\n导出乱码\n\n客服不回".encode("utf-8"), has_header=False)
        assert r.status == "ok"
        assert r.columns == ["文本"]
        assert r.rows == [["登录很慢"], ["导出乱码"], ["客服不回"]]


class TestUnsupported:
    def test_xls_rejected_with_hint(self):
        r = parse_upload("f.xls", b"...", has_header=True)
        assert r.status == "error"
        assert "另存为" in r.message

    def test_unknown_ext_rejected(self):
        r = parse_upload("f.docx", b"...", has_header=True)
        assert r.status == "error"
        assert "不支持" in r.message
