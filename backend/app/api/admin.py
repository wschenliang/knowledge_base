"""Admin-only API：审计日志查询"""

from __future__ import annotations

import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.permissions import require_admin
from app.models.acl import AuditLog
from app.models.database import get_db
from app.models.document import User

router = APIRouter(prefix="/api/v1/admin", tags=["管理员"])


class AuditLogItem(BaseModel):
    """单条审计日志"""
    id: int
    user_id: Optional[str] = None
    username: Optional[str] = None
    action: str
    resource_type: str
    resource_id: str
    detail: Optional[dict] = None
    ip_address: Optional[str] = None
    created_at: datetime.datetime


class AuditLogList(BaseModel):
    """审计日志列表响应"""
    items: list[AuditLogItem]
    total: int


@router.get("/audit-logs", response_model=AuditLogList)
async def list_audit_logs(
    user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    resource_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """查询审计日志（仅 admin）

    Query 参数（可任意组合）：
    - user_id: 按操作者筛选
    - action: 按动作类型（如 acl.grant / doc.delete）筛选
    - resource_type: 按资源类型（如 collection / document）筛选
    - resource_id: 按资源 ID 筛选
    """
    # count 查询（分开走避免 cartesian product）
    count_base = select(func.count(AuditLog.id))
    if user_id:
        count_base = count_base.where(AuditLog.user_id == user_id)
    if action:
        count_base = count_base.where(AuditLog.action == action)
    if resource_type:
        count_base = count_base.where(AuditLog.resource_type == resource_type)
    if resource_id:
        count_base = count_base.where(AuditLog.resource_id == resource_id)
    total = (await db.execute(count_base)).scalar() or 0

    # 列表查询：LEFT JOIN users 以取 username
    base = select(AuditLog, User.username).outerjoin(
        User, User.id == AuditLog.user_id
    )
    if user_id:
        base = base.where(AuditLog.user_id == user_id)
    if action:
        base = base.where(AuditLog.action == action)
    if resource_type:
        base = base.where(AuditLog.resource_type == resource_type)
    if resource_id:
        base = base.where(AuditLog.resource_id == resource_id)

    result = await db.execute(
        base.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
    )
    rows = result.all()

    items = []
    for log, username in rows:
        items.append(
            AuditLogItem(
                id=log.id,
                user_id=log.user_id,
                username=username,
                action=log.action,
                resource_type=log.resource_type,
                resource_id=log.resource_id,
                detail=log.detail,
                ip_address=log.ip_address,
                created_at=log.created_at,
            )
        )

    return AuditLogList(items=items, total=total)
