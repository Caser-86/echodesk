"""M2 清洗去重服务：去空值 / 去完全重复 / 超长截断 / 敏感信息脱敏。

输出清洗报告（各步骤丢弃/处理数量），保证流程透明、可排查。
纯本地规则实现，不依赖 LLM，任何模式下都能运行。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable

# 中英文手机号、邮箱、IPv4 地址
_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"1[3-9]\d{9}"),  # 中国大陆手机号
    re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.]+\b"),  # 邮箱
    re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b"),  # IPv4
]


@dataclass
class CleanResult:
    records: list[str] = field(default_factory=list)  # 清洗后的有效文本（保序）
    dropped_empty: int = 0
    dropped_duplicate: int = 0
    truncated: int = 0
    masked: int = 0
    original_count: int = 0

    @property
    def valid_count(self) -> int:
        return len(self.records)


@dataclass
class CleanOptions:
    max_len: int = 500
    strip_whitespace: bool = True
    dedupe_exact: bool = True
    mask_secrets: bool = True


def clean_records(
    texts: Iterable[str],
    options: CleanOptions | None = None,
) -> CleanResult:
    """对一组原始反馈文本执行清洗，返回清洗结果与统计。"""
    opts = options or CleanOptions()
    result = CleanResult(original_count=0)

    seen: set[str] = set()
    for raw in texts:
        if raw is None:
            continue
        text = str(raw)
        if opts.strip_whitespace:
            text = " ".join(text.split())

        result.original_count += 1

        if not text.strip():
            result.dropped_empty += 1
            continue

        if opts.dedupe_exact:
            key = text.lower()
            if key in seen:
                result.dropped_duplicate += 1
                continue
            seen.add(key)

        if len(text) > opts.max_len:
            text = text[: opts.max_len]
            result.truncated += 1

        if opts.mask_secrets:
            text, masked_count = _mask(text)
            result.masked += masked_count

        result.records.append(text)

    return result


def _mask(text: str) -> tuple[str, int]:
    """将手机号/邮箱/IP 替换为占位符，返回(替换后文本, 替换次数)。"""
    count = 0
    for pat in _PATTERNS:
        text, n = pat.subn("[已脱敏]", text)
        count += n
    return text, count


# 便捷别名：供 other services/frontend 引用
clean_feedback = clean_records