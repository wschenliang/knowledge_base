"""知识库集合管理 API"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_current_user
from app.models.database import get_db
from app.models.document import User
from app.schemas.document import (
    CollectionCreate,
    CollectionList,
    CollectionResponse,
)
from app.services.document_service import DocumentService

router = APIRouter(prefix="/api/v1/collections", tags=["知识库集合"])
document_service = DocumentService()


@router.post("", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
async def create_collection(
    request: CollectionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建知识库集合（创建者自动获得 owner ACL）"""
    collection = await document_service.create_collection(
        name=request.name,
        description=request.description,
        owner_id=current_user.id,
        chunk_size=request.chunk_size,
        chunk_overlap=request.chunk_overlap,
        db=db,
    )

    # 自动为创建者建立 owner ACL（绕过 grant 因为它不接受 owner role）
    from app.models.acl import CollectionACL

    owner_acl = CollectionACL(
        collection_id=collection.id,
        user_id=current_user.id,
        role="owner",
        granted_by=current_user.id,
    )
    db.add(owner_acl)
    await db.commit()
    await db.refresh(collection)

    return CollectionResponse.model_validate(collection)


@router.get("", response_model=CollectionList)
async def list_collections(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """列出知识库集合（admin 看全部；普通用户仅看自己有 ACL 的）"""
    collections, total = await document_service.list_collections(
        db=db, user=current_user, skip=skip, limit=limit
    )
    return CollectionList(
        items=[CollectionResponse.model_validate(c) for c in collections],
        total=total,
    )


@router.get("/{collection_id}", response_model=CollectionResponse)
async def get_collection(
    request: Request,
    collection_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取知识库集合详情（需要 viewer+）"""
    from app.auth.permissions import require_collection_role

    _, collection = await require_collection_role(
        request, min_role="viewer", db=db, current_user=current_user
    )

    # 附带当前用户角色
    response = CollectionResponse.model_validate(collection)
    response.my_role = "owner" if current_user.role == "admin" else None
    if not response.my_role:
        from app.services.permission_service import PermissionService

        response.my_role = await PermissionService().get_role(
            current_user.id, collection_id, db
        )
    return response
