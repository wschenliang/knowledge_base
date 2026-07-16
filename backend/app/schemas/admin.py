"""Admin 相关 Pydantic 模型"""

from __future__ import annotations

import datetime
from typing import Optional

from pydantic import BaseModel, Field


class UserListItem(BaseModel):
    """用户列表项（不含敏感信息）"""
    id: str
    username: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: str
    is_active: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    """用户列表响应"""
    items: list[UserListItem]
    total: int


class UserUpdateRequest(BaseModel):
    """管理员更新用户请求"""
    display_name: Optional[str] = Field(None, max_length=255)
    role: Optional[str] = Field(None, pattern="^(user|admin)$")
    is_active: Optional[bool] = None


class UserStats(BaseModel):
    """用户统计信息"""
    total_users: int
    active_users: int
    admin_users: int
    new_today: int


class UserDetailResponse(UserListItem):
    """用户详情（扩展列表项）"""
    collection_count: int = 0
    conversation_count: int = 0
    message_count: int = 0
    last_login_at: Optional[datetime.datetime] = None
