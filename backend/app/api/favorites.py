"""收藏 API"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_current_user
from app.models.database import get_db
from app.models.document import User
from app.schemas.favorite import (
    FavoriteCreate,
    FavoriteResponse,
    FavoriteListResponse,
    FavoriteUpdateNote,
)
from app.services.favorite_service import FavoriteService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/favorites", tags=["收藏"])
favorite_service = FavoriteService()


@router.post("", status_code=201)
async def add_favorite(
    request: FavoriteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """收藏一条 assistant 消息"""
    try:
        favorite = await favorite_service.add_favorite(
            user_id=current_user.id,
            message_id=request.message_id,
            note=request.note,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 构建完整响应（需要查询关联数据）
    items, _ = await favorite_service.list_favorites(
        user_id=current_user.id,
        keyword=None,
        collection_id=None,
        skip=0,
        limit=1,
        db=db,
    )
    # 找到刚收藏的条目
    for item in items:
        if item["message_id"] == favorite.message_id:
            return FavoriteResponse(**item)

    # fallback：直接返回基础字段
    return FavoriteResponse(
        id=favorite.id,
        message_id=favorite.message_id,
        conversation_id=favorite.conversation_id,
        collection_id=favorite.collection_id,
        note=favorite.note,
        message_content="",
        question_content=None,
        collection_name=None,
        created_at=favorite.created_at,
    )


@router.delete("/{message_id}", status_code=204)
async def remove_favorite(
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """取消收藏"""
    deleted = await favorite_service.remove_favorite(
        user_id=current_user.id,
        message_id=message_id,
        db=db,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="收藏记录不存在")


@router.get("", response_model=FavoriteListResponse)
async def list_favorites(
    collection_id: str | None = None,
    keyword: str | None = None,
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取收藏列表（支持按知识库筛选和关键词搜索）"""
    items, total = await favorite_service.list_favorites(
        user_id=current_user.id,
        collection_id=collection_id,
        keyword=keyword,
        skip=skip,
        limit=limit,
        db=db,
    )
    return FavoriteListResponse(
        items=[FavoriteResponse(**item) for item in items],
        total=total,
    )


@router.put("/{message_id}/note")
async def update_favorite_note(
    message_id: str,
    request: FavoriteUpdateNote,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新收藏备注"""
    favorite = await favorite_service.update_note(
        user_id=current_user.id,
        message_id=message_id,
        note=request.note,
        db=db,
    )
    if not favorite:
        raise HTTPException(status_code=404, detail="收藏记录不存在")
    return {"message": "备注已更新"}


@router.get("/check")
async def check_favorites(
    message_ids: str = Query(..., description="逗号分隔的消息 ID 列表"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """批量检查消息是否已收藏，返回 {message_id: bool}"""
    id_list = [mid.strip() for mid in message_ids.split(",") if mid.strip()]
    if not id_list:
        return {}
    result = await favorite_service.batch_check_favorited(
        user_id=current_user.id,
        message_ids=id_list,
        db=db,
    )
    return result
