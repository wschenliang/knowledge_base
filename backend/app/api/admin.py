"""Admin-only API：审计日志查询与导出 + 用户管理"""

from __future__ import annotations

import csv
import datetime
import io
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import create_access_token
from app.auth.permissions import require_admin
from app.config import settings
from app.models.acl import AuditLog
from app.models.database import get_db
from app.models.document import Collection, Conversation, Message, User
from app.schemas.admin import (
    UserDetailResponse,
    UserListItem,
    UserListResponse,
    UserStats,
    UserUpdateRequest,
)
from app.services.audit_service import AuditService
from app.services.email_service import EmailService

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
    user_agent: Optional[str] = None
    created_at: datetime.datetime


class AuditLogList(BaseModel):
    """审计日志列表响应"""
    items: list[AuditLogItem]
    total: int


def _apply_filters(query, user_id, action, resource_type, resource_id,
                   start_time, end_time, keyword):
    """统一应用筛选条件"""
    if user_id:
        query = query.where(AuditLog.user_id == user_id)
    if action:
        query = query.where(AuditLog.action == action)
    if resource_type:
        query = query.where(AuditLog.resource_type == resource_type)
    if resource_id:
        query = query.where(AuditLog.resource_id == resource_id)
    if start_time:
        query = query.where(AuditLog.created_at >= start_time)
    if end_time:
        query = query.where(AuditLog.created_at <= end_time)
    if keyword:
        pattern = f"%{keyword}%"
        query = query.where(
            or_(
                AuditLog.action.ilike(pattern),
                AuditLog.resource_id.ilike(pattern),
                AuditLog.detail.cast(str).ilike(pattern),
            )
        )
    return query


@router.get("/audit-logs", response_model=AuditLogList)
async def list_audit_logs(
    user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    resource_id: Optional[str] = Query(None),
    start_time: Optional[datetime.datetime] = Query(None),
    end_time: Optional[datetime.datetime] = Query(None),
    keyword: Optional[str] = Query(None),
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
    - start_time / end_time: 时间范围筛选
    - keyword: 模糊搜索（匹配 action / resource_id / detail）
    """
    # count 查询
    count_base = select(func.count(AuditLog.id))
    count_base = _apply_filters(
        count_base, user_id, action, resource_type, resource_id,
        start_time, end_time, keyword,
    )
    total = (await db.execute(count_base)).scalar() or 0

    # 列表查询：LEFT JOIN users 以取 username
    base = select(AuditLog, User.username).outerjoin(
        User, User.id == AuditLog.user_id
    )
    base = _apply_filters(
        base, user_id, action, resource_type, resource_id,
        start_time, end_time, keyword,
    )

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
                user_agent=log.user_agent,
                created_at=log.created_at,
            )
        )

    return AuditLogList(items=items, total=total)


@router.get("/audit-logs/export")
async def export_audit_logs(
    user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    resource_id: Optional[str] = Query(None),
    start_time: Optional[datetime.datetime] = Query(None),
    end_time: Optional[datetime.datetime] = Query(None),
    keyword: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """导出审计日志为 CSV 文件（仅 admin）"""
    base = select(AuditLog, User.username).outerjoin(
        User, User.id == AuditLog.user_id
    )
    base = _apply_filters(
        base, user_id, action, resource_type, resource_id,
        start_time, end_time, keyword,
    )
    result = await db.execute(
        base.order_by(AuditLog.created_at.desc()).limit(10000)
    )
    rows = result.all()

    # 生成 CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["时间", "用户", "操作", "资源类型", "资源ID", "详情", "IP地址"])

    for log, username in rows:
        detail_str = str(log.detail) if log.detail else ""
        writer.writerow([
            log.created_at.isoformat() if log.created_at else "",
            username or log.user_id or "系统",
            log.action,
            log.resource_type,
            log.resource_id,
            detail_str,
            log.ip_address or "",
        ])

    output.seek(0)

    # 生成文件名
    now = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"audit_logs_{now}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/users/stats", response_model=UserStats)
async def get_user_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """获取用户统计（仅 admin）"""
    total = (await db.execute(select(func.count(User.id)))).scalar() or 0
    active = (await db.execute(select(func.count(User.id)).where(User.is_active == True))).scalar() or 0
    admin_count = (await db.execute(select(func.count(User.id)).where(User.role == "admin"))).scalar() or 0

    today_start = datetime.datetime.now(datetime.timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    new_today = (
        await db.execute(select(func.count(User.id)).where(User.created_at >= today_start))
    ).scalar() or 0

    await AuditService.log(
        db=db,
        user_id=current_user.id,
        action="user.list",
        resource_type="user",
        resource_id="stats",
        detail={"scope": "stats"},
    )
    await db.commit()

    return UserStats(
        total_users=total,
        active_users=active,
        admin_users=admin_count,
        new_today=new_today,
    )


@router.get("/users", response_model=UserListResponse)
async def list_users(
    keyword: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """查询用户列表（仅 admin）"""
    # count
    count_query = select(func.count(User.id))
    if role:
        count_query = count_query.where(User.role == role)
    if is_active is not None:
        count_query = count_query.where(User.is_active == is_active)
    if keyword:
        pattern = f"%{keyword}%"
        count_query = count_query.where(
            or_(
                User.username.ilike(pattern),
                User.email.ilike(pattern),
                User.display_name.ilike(pattern),
            )
        )
    total = (await db.execute(count_query)).scalar() or 0

    # list
    query = select(User)
    if role:
        query = query.where(User.role == role)
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    if keyword:
        pattern = f"%{keyword}%"
        query = query.where(
            or_(
                User.username.ilike(pattern),
                User.email.ilike(pattern),
                User.display_name.ilike(pattern),
            )
        )
    query = query.order_by(User.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()

    await AuditService.log(
        db=db,
        user_id=current_user.id,
        action="user.list",
        resource_type="user",
        resource_id="list",
        detail={"keyword": keyword, "role": role, "is_active": is_active},
    )
    await db.commit()

    return UserListResponse(
        items=[UserListItem.model_validate(u) for u in users],
        total=total,
    )


@router.get("/users/{user_id}", response_model=UserDetailResponse)
async def get_user_detail(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """查看用户详情（仅 admin）"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 统计
    collection_count = (
        await db.execute(select(func.count(Collection.id)).where(Collection.owner_id == user_id))
    ).scalar() or 0
    conversation_count = (
        await db.execute(select(func.count(Conversation.id)).where(Conversation.user_id == user_id))
    ).scalar() or 0
    message_count = (
        await db.execute(
            select(func.count(Message.id))
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(Conversation.user_id == user_id)
        )
    ).scalar() or 0

    await AuditService.log(
        db=db,
        user_id=current_user.id,
        action="user.view",
        resource_type="user",
        resource_id=user_id,
        detail={"username": user.username},
    )
    await db.commit()

    return UserDetailResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
        collection_count=collection_count,
        conversation_count=conversation_count,
        message_count=message_count,
        last_login_at=user.last_login_at,
    )


@router.put("/users/{user_id}", response_model=UserDetailResponse)
async def update_user(
    user_id: str,
    request: UserUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """更新用户信息（仅 admin）"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 禁止修改自己的角色
    if user_id == current_user.id and request.role is not None and request.role != current_user.role:
        raise HTTPException(status_code=409, detail="不能修改自己的管理员权限")

    # 禁止禁用最后一个 admin
    if request.is_active is False and user.role == "admin":
        admin_count = (
            await db.execute(select(func.count(User.id)).where(User.role == "admin", User.is_active == True))
        ).scalar() or 0
        if admin_count <= 1:
            raise HTTPException(status_code=409, detail="系统必须保留至少一个管理员")

    old_role = user.role
    old_active = user.is_active

    if request.display_name is not None:
        user.display_name = request.display_name
    if request.role is not None:
        user.role = request.role
    if request.is_active is not None:
        user.is_active = request.is_active

    await db.flush()

    action_code = "user.update"
    if request.is_active is not None:
        action_code = "user.enable" if request.is_active else "user.disable"

    await AuditService.log(
        db=db,
        user_id=current_user.id,
        action=action_code,
        resource_type="user",
        resource_id=user_id,
        detail={
            "username": user.username,
            "old_role": old_role,
            "new_role": user.role,
            "old_active": old_active,
            "new_active": user.is_active,
        },
    )
    await db.commit()

    return UserDetailResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
        collection_count=0,
        conversation_count=0,
        message_count=0,
        last_login_at=user.last_login_at,
    )


@router.post("/users/{user_id}/toggle-status")
async def toggle_user_status(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """切换用户禁用/启用状态（仅 admin）"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")

    if user_id == current_user.id:
        raise HTTPException(status_code=409, detail="不能禁用当前登录的管理员账号")

    if not user.is_active and user.role == "admin":
        # 即将禁用 admin，检查是否最后一个
        admin_count = (
            await db.execute(select(func.count(User.id)).where(User.role == "admin", User.is_active == True))
        ).scalar() or 0
        if admin_count <= 1:
            raise HTTPException(status_code=409, detail="系统必须保留至少一个管理员")

    user.is_active = not user.is_active
    await db.flush()

    action_code = "user.enable" if user.is_active else "user.disable"
    await AuditService.log(
        db=db,
        user_id=current_user.id,
        action=action_code,
        resource_type="user",
        resource_id=user_id,
        detail={"username": user.username, "is_active": user.is_active},
    )
    await db.commit()

    return {"id": user.id, "is_active": user.is_active, "message": "状态已更新"}


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """发送密码重置邮件（仅 admin）"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")

    if not user.email:
        raise HTTPException(status_code=400, detail="用户未设置邮箱")

    # 生成 JWT 重置 token（1小时有效）
    reset_token = create_access_token(
        user_id=user.id,
        username=user.username,
        role=user.role,
        expires_delta=datetime.timedelta(hours=1),
    )

    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"

    await EmailService.send_reset_password_email(user.email, reset_url)

    await AuditService.log(
        db=db,
        user_id=current_user.id,
        action="user.reset_password",
        resource_type="user",
        resource_id=user_id,
        detail={"username": user.username, "email": user.email},
    )
    await db.commit()

    return {"message": "密码重置邮件已发送"}
