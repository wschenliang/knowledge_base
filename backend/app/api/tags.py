"""标签管理 API"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_current_user
from app.models.database import get_db
from app.models.document import User
from app.schemas.document import (
    TagCreate,
    TagUpdate,
    TagResponse,
    TagListResponse,
)
from app.services.tag_service import TagService
from app.services.audit_service import AuditService

router = APIRouter(prefix="/api/v1/tags", tags=["标签管理"])
tag_service = TagService()


@router.get("", response_model=TagListResponse)
async def list_tags(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取所有标签（含使用次数）"""
    items, total = await tag_service.list_tags(db)
    return TagListResponse(
        items=[TagResponse(**item) for item in items],
        total=total,
    )


@router.post("", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
async def create_tag(
    request: TagCreate,
    req: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建标签"""
    try:
        tag = await tag_service.create_tag(
            name=request.name,
            color=request.color,
            created_by=current_user.id,
            db=db,
        )
        await db.commit()
        await db.refresh(tag)

        # 审计日志
        await AuditService.log(
            db=db,
            user_id=current_user.id,
            action="tag.create",
            resource_type="tag",
            resource_id=tag.id,
            detail={"name": tag.name},
            request=req,
        )
        await db.commit()

        return TagResponse(
            id=tag.id,
            name=tag.name,
            color=tag.color,
            created_by=tag.created_by,
            collection_count=0,
            created_at=tag.created_at,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.put("/{tag_id}", response_model=TagResponse)
async def update_tag(
    tag_id: str,
    request: TagUpdate,
    req: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """编辑标签（标签创建者或 admin）"""
    tag = await tag_service.get_tag(tag_id, db)
    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="标签不存在",
        )

    # 权限检查：创建者或 admin
    if tag.created_by != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权修改此标签",
        )

    try:
        updated_tag = await tag_service.update_tag(
            tag_id=tag_id,
            name=request.name,
            color=request.color,
            db=db,
        )
        await db.commit()
        await db.refresh(updated_tag)

        # 获取使用次数
        items, _ = await tag_service.list_tags(db)
        collection_count = 0
        for item in items:
            if item["id"] == tag_id:
                collection_count = item["collection_count"]
                break

        # 审计日志
        await AuditService.log(
            db=db,
            user_id=current_user.id,
            action="tag.update",
            resource_type="tag",
            resource_id=tag_id,
            detail={"name": updated_tag.name},
            request=req,
        )
        await db.commit()

        return TagResponse(
            id=updated_tag.id,
            name=updated_tag.name,
            color=updated_tag.color,
            created_by=updated_tag.created_by,
            collection_count=collection_count,
            created_at=updated_tag.created_at,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: str,
    req: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除标签（标签创建者或 admin）"""
    tag = await tag_service.get_tag(tag_id, db)
    if tag is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="标签不存在",
        )

    # 权限检查：创建者或 admin
    if tag.created_by != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权删除此标签",
        )

    await tag_service.delete_tag(tag_id, db)

    # 审计日志
    await AuditService.log(
        db=db,
        user_id=current_user.id,
        action="tag.delete",
        resource_type="tag",
        resource_id=tag_id,
        detail={"name": tag.name},
        request=req,
    )
    await db.commit()
