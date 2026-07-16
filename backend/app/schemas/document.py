"""文档相关 Pydantic 模型"""

from __future__ import annotations

import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ===== 标签相关 =====

class TagCreate(BaseModel):
    """创建标签请求"""
    name: str = Field(..., min_length=1, max_length=50)
    color: Optional[str] = Field(None, max_length=7)  # hex color e.g. #3B82F6


class TagUpdate(BaseModel):
    """更新标签请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    color: Optional[str] = Field(None, max_length=7)


class TagResponse(BaseModel):
    """标签响应"""
    id: str
    name: str
    color: Optional[str] = None
    created_by: Optional[str] = None
    collection_count: int = 0
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class TagListResponse(BaseModel):
    """标签列表"""
    items: list[TagResponse]
    total: int


class CollectionTagUpdate(BaseModel):
    """设置知识库标签请求（全量替换）"""
    tag_ids: list[str]


class DocumentCreate(BaseModel):
    """创建文档请求"""
    collection_id: str
    filename: str
    description: Optional[str] = None


class DocumentResponse(BaseModel):
    """文档响应"""
    id: str
    collection_id: str
    filename: str
    file_type: str
    file_size: int
    title: Optional[str] = None
    description: Optional[str] = None
    chunk_count: int
    status: str
    error_message: Optional[str] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = {"from_attributes": True}


class DocumentList(BaseModel):
    """文档列表"""
    items: list[DocumentResponse]
    total: int


class CollectionCreate(BaseModel):
    """创建知识库集合请求"""
    name: str
    description: Optional[str] = None
    is_public: bool = False  # 已废弃，保留以兼容旧客户端
    embedding_model: str = "bge-m3"
    chunk_size: int = 512
    chunk_overlap: int = 128


class CollectionResponse(BaseModel):
    """知识库集合响应"""
    id: str
    name: str
    description: Optional[str] = None
    qdrant_collection: str
    is_public: bool = False  # 已废弃，保留以兼容
    owner_id: Optional[str] = None
    document_count: int
    created_at: datetime.datetime
    updated_at: datetime.datetime
    my_role: Optional[str] = None  # 当前用户对此 KB 的角色（acl.get_role）
    tags: list[TagResponse] = []  # 该知识库的标签

    model_config = {"from_attributes": True}


class CollectionList(BaseModel):
    """知识库集合列表"""
    items: list[CollectionResponse]
    total: int


class PreviewResponse(BaseModel):
    """文档预览响应"""
    content: str
    format: str = "text"

    model_config = {"from_attributes": True}
