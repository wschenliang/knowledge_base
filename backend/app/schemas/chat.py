"""问答相关 Pydantic 模型"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class SourceItem(BaseModel):
    """引用来源项"""
    index: int
    source: str
    text: str
    score: float


class ChatRequest(BaseModel):
    """问答请求"""
    query: str
    collection_id: str
    conversation_id: Optional[str] = None
    top_k: int = 5
    use_reranker: bool = True


class ChatResponse(BaseModel):
    """问答响应"""
    answer: str
    sources: list[SourceItem]
    conversation_id: str


class SearchRequest(BaseModel):
    """搜索请求"""
    query: str
    collection_id: str
    top_k: int = 10
    use_reranker: bool = True


class SearchResponse(BaseModel):
    """搜索响应"""
    query: str
    results: list[SourceItem]
    total: int
