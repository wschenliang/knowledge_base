"""问答相关 Pydantic 模型"""

from __future__ import annotations

import datetime
from typing import List, Optional

from pydantic import BaseModel, field_validator


class SearchFilters(BaseModel):
    """高级搜索筛选条件（向后兼容：所有字段 Optional）"""
    file_types: Optional[List[str]] = None      # 例如 ["pdf", "docx"]
    uploader_ids: Optional[List[str]] = None    # user_id 列表
    tag_ids: Optional[List[str]] = None         # tag_id 列表
    filename_contains: Optional[str] = None     # 文件名 LIKE 模糊匹配


class FacetOption(BaseModel):
    """筛选维度的一个可选值"""
    value: str          # uploader_id / tag_id / file_type
    label: str          # 显示文本
    count: int          # 当前 KB 内匹配文档数


class SearchFacetsResponse(BaseModel):
    """搜索筛选面板的可选值"""
    uploaders: List[FacetOption]
    tags: List[FacetOption]
    file_types: List[FacetOption]


class SourceItem(BaseModel):
    """引用来源项（向后兼容：所有新字段默认空值）"""
    index: int
    source: str
    text: str
    score: float
    file_type: Optional[str] = None
    uploader_username: Optional[str] = None
    document_id: Optional[str] = None
    tag_ids: List[str] = []
    highlight_terms: List[str] = []


class ChatRequest(BaseModel):
    """问答请求"""
    query: str
    collection_id: str
    conversation_id: Optional[str] = None
    top_k: int = 5
    use_reranker: bool = True
    filters: Optional[SearchFilters] = None


class ChatResponse(BaseModel):
    """问答响应"""
    answer: str
    sources: list[SourceItem]
    conversation_id: str


class SearchRequest(BaseModel):
    """搜索请求（向后兼容：filters 默认 None）"""
    query: str
    collection_id: str
    top_k: int = 10
    use_reranker: bool = True
    filters: Optional["SearchFilters"] = None


class SearchResponse(BaseModel):
    """搜索响应"""
    query: str
    results: List[SourceItem]
    total: int
    applied_filters: Optional[SearchFilters] = None   # 回显当前生效筛选


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


# 解决 SearchRequest.filters 前向引用 SearchFilters
SearchRequest.model_rebuild()
