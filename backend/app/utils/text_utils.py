"""文本工具函数"""

from __future__ import annotations

import re


def truncate_text(text: str, max_length: int = 500) -> str:
    """截断文本到指定长度"""
    if len(text) <= max_length:
        return text
    return text[:max_length] + "..."


def clean_text(text: str) -> str:
    """清理文本: 移除多余空白和特殊字符"""
    # 移除多余空白
    text = re.sub(r"\s+", " ", text)
    # 移除控制字符
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    return text.strip()


def extract_title(text: str) -> str:
    """从文本中提取标题"""
    lines = text.strip().split("\n")
    for line in lines:
        line = line.strip()
        if line and len(line) < 200:
            return line
    return "未命名文档"
