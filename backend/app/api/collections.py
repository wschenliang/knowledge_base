"""知识库集合管理 API"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
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
    """创建知识库集合"""
    collection = await document_service.create_collection(
        name=request.name,
        description=request.description,
        owner_id=current_user.id,
        chunk_size=request.chunk_size,
        chunk_overlap=request.chunk_overlap,
        db=db,
    )
    return CollectionResponse.model_validate(collection)


@router.get("", response_model=CollectionList)
async def list_collections(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """列出知识库集合"""
    collections, total = await document_service.list_collections(
        db=db, skip=skip, limit=limit
    )
    return CollectionList(
        items=[CollectionResponse.model_validate(c) for c in collections],
        total=total,
    )


@router.get("/{collection_id}", response_model=CollectionResponse)
async def get_collection(
    collection_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取知识库集合详情"""
    from sqlalchemy import select
    from app.models.document import Collection

    result = await db.execute(
        select(Collection).where(Collection.id == collection_id)
    )
    collection = result.scalar_one_or_none()
    if collection is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="知识库集合不存在",
        )
    return CollectionResponse.model_validate(collection)
