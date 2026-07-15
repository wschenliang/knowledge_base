"""ACL 相关 Pydantic 模型"""

from __future__ import annotations

import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ACLInviteRequest(BaseModel):
    """邀请新成员请求"""
    username: str = Field(..., min_length=1, max_length=100)
    role: str = Field(..., pattern="^(editor|viewer)$")


class ACLUpdateRequest(BaseModel):
    """修改角色请求（允许 owner↔editor↔viewer 互换）"""
    role: str = Field(..., pattern="^(owner|editor|viewer)$")


class ACLTransferRequest(BaseModel):
    """所有权转移请求（目标用户必须是当前成员）"""
    new_owner_username: str = Field(..., min_length=1, max_length=100)


class ACLMemberResponse(BaseModel):
    """成员信息响应"""
    id: str
    user_id: str
    username: str
    display_name: Optional[str] = None
    role: str
    granted_by: Optional[str] = None
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class ACLMemberList(BaseModel):
    """成员列表响应"""
    items: list[ACLMemberResponse]
    total: int


class ACLTransferResponse(BaseModel):
    """所有权转移响应"""
    old_owner_id: str
    new_owner_id: str
    collection_id: str
