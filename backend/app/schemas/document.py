"""文档相关 Pydantic 模型"""

from __future__ import annotations

import datetime
from typing import Optional

from pydantic import BaseModel


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
