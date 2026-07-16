"""问答相关 Pydantic 模型"""

from __future__ import annotations

import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


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


# ===== 对话历史 =====

class MessageResponse(BaseModel):
    """消息响应"""
    id: str
    role: str
    content: str
    sources: Optional[list[SourceItem]] = None
    is_favorited: bool = False
    created_at: datetime.datetime

    model_config = {"from_attributes": True}

    @field_validator("sources", mode="before")
    @classmethod
    def parse_sources(cls, v):
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except (json.JSONDecodeError, TypeError):
                return None
        return v


class ConversationResponse(BaseModel):
    """对话响应"""
    id: str
    collection_id: str
    title: str
    message_count: int
    has_favorite: bool = False
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = {"from_attributes": True}


class ConversationDetail(ConversationResponse):
    """对话详情（含消息列表）"""
    messages: list[MessageResponse] = []


class ConversationList(BaseModel):
    """对话列表"""
    items: list[ConversationResponse]
    total: int


class RenameConversationRequest(BaseModel):
    """重命名对话请求"""
    title: str
