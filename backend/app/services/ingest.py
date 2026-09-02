"""M1 数据导入：CSV / XLSX / TXT 解析（纯函数核心，便于单测）。

设计要点：
- CSV 编码检测链：utf-8-sig（Excel 导出带 BOM）→ gbk（中文 Windows 常见）→ latin-1 兜底
  （latin-1 永不失败，仅保证读出字节，中文文件实际不会走到这步）
- 表头由调用方决定（前端开关），无表头时列名用 "第1列/第2列/..."（Excel 风格）
- 行数上限 settings.max_rows（默认 5000），超出截断并在结果中注明
- XLSX 用 openpyxl 只读模式流式遍历首个工作表；TXT 按行读取（单列、无表头）
- .xls 旧格式不支持（需 xlrd，收益低），明确报错引导转换
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass

from app.core.config import get_settings

SUPPORTED_EXT = {".csv", ".xlsx", ".txt"}


@dataclass
class IngestResult:
    status: str  # ok | error
    filename: str
    format: str  # csv | xlsx | txt
    n_rows: int  # 解析出的数据行数（不含表头）
    n_cols: int
    columns: list[str]
    rows: list[list[str]]  # 数据行（≤ max_rows）
    truncated: bool  # 是否因超出上限被截断
    message: str = ""


def _decode_bytes(data: bytes) -> str:
    """编码检测链：utf-8-sig → gbk → latin-1（兜底，永不抛）。"""
    for enc in ("utf-8-sig", "gbk"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1")


def _col_name(i: int) -> str:
    return f"第{i + 1}列"


def _parse_csv(data: bytes, has_header: bool) -> tuple[list[str], list[list[str]]]:
    text = _decode_bytes(data)
    # 统一换行符，兼容 \r\n / \r
    reader = csv.reader(io.StringIO(text.replace("\r\n", "\n").replace("\r", "\n")))
    all_rows = [row for row in reader if any(str(c).strip() for c in row)]
    if not all_rows:
        return [], []
    if has_header:
        header = [str(c).strip() or _col_name(i) for i, c in enumerate(all_rows[0])]
        return header, [[str(c) for c in r] for r in all_rows[1:]]
    n_cols = max(len(r) for r in all_rows)
    return [_col_name(i) for i in range(n_cols)], all_rows


def _parse_txt(data: bytes) -> tuple[list[str], list[list[str]]]:
    text = _decode_bytes(data)
    lines = [ln.strip() for ln in text.replace("\r\n", "\n").split("\n") if ln.strip()]
    return ["文本"], [[ln] for ln in lines]


def _parse_xlsx(data: bytes, has_header: bool) -> tuple[list[str], list[list[str]]]:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb.worksheets[0]  # 首个工作表
    all_rows: list[list[str]] = []
    for row in ws.iter_rows(values_only=True):
        vals = [("" if v is None else str(v)).strip() for v in row]
        if any(vals):
            all_rows.append(vals)
    wb.close()
    if not all_rows:
        return [], []
    if has_header:
        header = [v or _col_name(i) for i, v in enumerate(all_rows[0])]
        return header, all_rows[1:]
    n_cols = max(len(r) for r in all_rows)
    return [_col_name(i) for i in range(n_cols)], all_rows


def parse_upload(
    filename: str, data: bytes, has_header: bool = True
) -> IngestResult:
    """解析上传文件。扩展名路由到对应解析器；异常统一转为 error 结果（不抛）。"""
    from pathlib import Path

    ext = Path(filename).suffix.lower()
    base = IngestResult(
        status="ok", filename=filename, format=ext.lstrip("."), n_rows=0, n_cols=0,
        columns=[], rows=[], truncated=False,
    )

    try:
        if ext == ".csv":
            columns, rows = _parse_csv(data, has_header)
        elif ext == ".txt":
            columns, rows = _parse_txt(data)  # txt 恒为单列无表头
        elif ext == ".xlsx":
            columns, rows = _parse_xlsx(data, has_header)
        elif ext == ".xls":
            base.status = "error"
            base.message = "暂不支持旧版 .xls，请另存为 .csv 或 .xlsx 后重试"
            return base
        else:
            base.status = "error"
            base.message = f"不支持的文件类型 {ext or '(无扩展名)'}，支持：{'/'.join(sorted(SUPPORTED_EXT))}"
            return base
    except Exception as exc:  # noqa: BLE001 —— 解析失败转为用户可读错误
        base.status = "error"
        base.message = f"文件解析失败：{exc.__class__.__name__}: {exc}"
        return base

    max_rows = get_settings().max_rows
    base.truncated = len(rows) > max_rows
    base.rows = rows[:max_rows]
    base.columns = columns
    base.n_rows = len(rows)
    base.n_cols = len(columns)
    if not rows:
        base.status = "error"
        base.message = "文件中未解析到有效数据行"
    return base
