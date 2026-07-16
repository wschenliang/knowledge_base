"""ACL 管理 API

6 个端点（所有写操作都要求 owner 权限；admin 通过 require_collection_role 短路）：
- GET    /collections/{id}/acl                  列出成员
- POST   /collections/{id}/acl                  邀请新成员（editor/viewer）
- PUT    /collections/{id}/acl/{user_id}         修改成员角色
- DELETE /collections/{id}/acl/{user_id}         移除成员
- POST   /collections/{id}/acl/transfer         转移所有权
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_current_user
from app.auth.permissions import require_collection_role
from app.models.database import get_db
from app.models.document import User
from app.schemas.acl import (
    ACLInviteRequest,
    ACLMemberList,
    ACLMemberResponse,
    ACLTransferRequest,
    ACLTransferResponse,
    ACLUpdateRequest,
)
from app.services.permission_service import PermissionService
from app.services.audit_service import AuditService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/collections/{collection_id}/acl", tags=["ACL"])
permission_service = PermissionService()


async def _username_to_user_id(username: str, db: AsyncSession) -> str:
    """把 username 解析为 user_id；不存在时抛 404"""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"用户不存在: {username}",
        )
    return user.id


async def _user_id_to_username(user_id: str, db: AsyncSession) -> str:
    """把 user_id 解析为 username；不存在时返回占位"unknown" """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        return "unknown"
    return user.username


@router.get("", response_model=ACLMemberList)
async def list_members(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """查看 KB 成员列表（需要 owner 权限）"""
    await require_collection_role(
        request, min_role="owner", db=db, current_user=current_user
    )

    collection_id = request.path_params["collection_id"]
    members = await permission_service.list_members(
        collection_id=collection_id, db=db
    )
    return ACLMemberList(
        items=[ACLMemberResponse(**m) for m in members],
        total=len(members),
    )


@router.post("", response_model=ACLMemberResponse, status_code=status.HTTP_201_CREATED)
async def invite_member(
    request: Request,
    body: ACLInviteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """邀请新成员（需要 owner 权限；role 必须是 editor 或 viewer）"""
    await require_collection_role(
        request, min_role="owner", db=db, current_user=current_user
    )

    collection_id = request.path_params["collection_id"]
    target_user_id = await _username_to_user_id(body.username, db)

    try:
        acl = await permission_service.grant(
            collection_id=collection_id,
            user_id=target_user_id,
            role=body.role,
            granted_by=current_user.id,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )

    # 审计
    await AuditService.log(
        db=db,
        user_id=current_user.id,
        action="acl.grant",
        resource_type="collection",
        resource_id=collection_id,
        detail={"target_user": body.username, "role": body.role},
        request=request,
    )
    await db.commit()
    await db.refresh(acl)

    return ACLMemberResponse(
        id=acl.id,
        user_id=acl.user_id,
        username=body.username,
        role=acl.role,
        granted_by=acl.granted_by,
        created_at=acl.created_at,
    )


@router.put("/{user_id}", response_model=ACLMemberResponse)
async def update_member_role(
    request: Request,
    user_id: str,
    body: ACLUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """修改成员角色（需要 owner 权限）"""
    await require_collection_role(
        request, min_role="owner", db=db, current_user=current_user
    )

    collection_id = request.path_params["collection_id"]
    old_role = await permission_service.get_role(user_id, collection_id, db)

    try:
        acl = await permission_service.update_role(
            collection_id=collection_id,
            user_id=user_id,
            new_role=body.role,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await AuditService.log(
        db=db,
        user_id=current_user.id,
        action="acl.update",
        resource_type="collection",
        resource_id=collection_id,
        detail={
            "target_user_id": user_id,
            "old_role": old_role,
            "new_role": body.role,
        },
        request=request,
    )
    await db.commit()
    await db.refresh(acl)

    return ACLMemberResponse(
        id=acl.id,
        user_id=acl.user_id,
        username=await _user_id_to_username(user_id, db),
        role=acl.role,
        granted_by=acl.granted_by,
        created_at=acl.created_at,
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    request: Request,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """移除成员（需要 owner 权限；不能移除 owner）"""
    await require_collection_role(
        request, min_role="owner", db=db, current_user=current_user
    )

    collection_id = request.path_params["collection_id"]
    try:
        removed = await permission_service.revoke(collection_id, user_id, db)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="成员不存在",
        )

    await AuditService.log(
        db=db,
        user_id=current_user.id,
        action="acl.revoke",
        resource_type="collection",
        resource_id=collection_id,
        detail={"target_user_id": user_id},
        request=request,
    )
    await db.commit()


@router.post("/transfer", response_model=ACLTransferResponse)
async def transfer_ownership(
    request: Request,
    body: ACLTransferRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """所有权转移（需要 owner 权限；目标用户必须是当前成员）"""
    await require_collection_role(
        request, min_role="owner", db=db, current_user=current_user
    )

    collection_id = request.path_params["collection_id"]
    new_owner_id = await _username_to_user_id(body.new_owner_username, db)

    try:
        await permission_service.transfer_ownership(
            collection_id=collection_id,
            current_owner_id=current_user.id,
            new_owner_id=new_owner_id,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await AuditService.log(
        db=db,
        user_id=current_user.id,
        action="acl.transfer",
        resource_type="collection",
        resource_id=collection_id,
        detail={
            "old_owner": current_user.id,
            "new_owner": new_owner_id,
        },
        request=request,
    )
    await db.commit()

    return ACLTransferResponse(
        old_owner_id=current_user.id,
        new_owner_id=new_owner_id,
        collection_id=collection_id,
    )
