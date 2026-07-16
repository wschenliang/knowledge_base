"""收藏相关 Pydantic 模型"""

from __future__ import annotations

import datetime
from typing import Optional

from pydantic import BaseModel


class FavoriteCreate(BaseModel):
    """收藏消息请求"""
    message_id: str
    note: Optional[str] = None


class FavoriteResponse(BaseModel):
    """收藏响应"""
    id: str
    message_id: str
    conversation_id: str
    collection_id: str
    note: Optional[str] = None
    message_content: str            # 关联的 assistant 消息内容
    question_content: Optional[str] = None  # 对应的 user 提问内容
    collection_name: Optional[str] = None   # 所属知识库名称
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class FavoriteListResponse(BaseModel):
    """收藏列表"""
    items: list[FavoriteResponse]
    total: int


class FavoriteUpdateNote(BaseModel):
    """更新收藏备注"""
    note: Optional[str] = None
