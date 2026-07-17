"""测试 HybridRetriever.get_query_highlight_terms()。"""

from __future__ import annotations

from app.rag.retriever import HybridRetriever


def _retriever() -> HybridRetriever:
    """不依赖 Qdrant（只测纯函数方法）。"""
    return HybridRetriever.__new__(HybridRetriever)


def test_empty_query_returns_empty():
    retriever = _retriever()
    assert retriever.get_query_highlight_terms("", [{"text": "运维指标"}]) == []


def test_no_chunks_returns_empty():
    retriever = _retriever()
    assert retriever.get_query_highlight_terms("运维指标", []) == []


def test_single_term_hit():
    retriever = _retriever()
    chunks = [{"text": "本章介绍运维指标的定义和计算方法"}]
    assert retriever.get_query_highlight_terms("运维指标", chunks) == ["运维指标"]


def test_term_not_in_chunks_returns_empty():
    retriever = _retriever()
    chunks = [{"text": "完全不相关的内容"}]
    assert retriever.get_query_highlight_terms("运维指标", chunks) == []


def test_case_insensitive_match():
    retriever = _retriever()
    chunks = [{"text": "Python is a great language"}]
    assert retriever.get_query_highlight_terms("python", chunks) == ["python"]


def test_multiple_terms_ranked_by_frequency():
    retriever = _retriever()
    chunks = [
        {"text": "运维涉及多个环节"},
        {"text": "指标体系是运维核心"},
        {"text": "运维与监控密不可分"},
    ]
    result = retriever.get_query_highlight_terms("运维 指标", chunks, max_terms=8)
    # 运维出现在 3 个 chunk；指标出现在 1 个
    assert result.index("运维") < result.index("指标")
    assert result == ["运维", "指标"]


def test_punctuation_split_for_chinese_query():
    retriever = _retriever()
    chunks = [{"text": "包含运维、监控、告警多个关键词"}]
    # 中文逗号应被切分
    result = retriever.get_query_highlight_terms("运维、监控", chunks)
    assert "运维" in result
    assert "监控" in result


def test_max_terms_truncation():
    retriever = _retriever()
    chunks = [{"text": "a b c d e f g h i j"}]
    # 注意：单字符会被过滤，所以用更长的 query
    chunks = [{"text": "alpha beta gamma delta epsilon zeta eta theta iota kappa"}]
    result = retriever.get_query_highlight_terms(
        "alpha beta gamma delta epsilon zeta eta theta iota kappa",
        chunks,
        max_terms=3,
    )
    assert len(result) == 3


def test_short_term_filtered_out():
    retriever = _retriever()
    chunks = [{"text": "单字 a 不应被高亮"}]
    # 切分后 a 长度 < 2 应被过滤
    assert retriever.get_query_highlight_terms("单字 a", chunks) == ["单字"]