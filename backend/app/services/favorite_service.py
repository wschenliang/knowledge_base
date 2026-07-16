"""收藏服务"""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import select, func, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Favorite, Message, Conversation, Collection

logger = logging.getLogger(__name__)


class FavoriteService:
    """收藏服务"""

    async def add_favorite(
        self,
        user_id: str,
        message_id: str,
        note: Optional[str],
        db: AsyncSession,
    ) -> Favorite:
        """收藏一条 assistant 消息

        Raises:
            ValueError: 消息不存在 / 不是 assistant 消息 / 已收藏
        """
        # 校验消息存在且为 assistant
        result = await db.execute(select(Message).where(Message.id == message_id))
        message = result.scalar_one_or_none()
        if message is None:
            raise ValueError("消息不存在")
        if message.role != "assistant":
            raise ValueError("只能收藏 AI 回复消息")

        # 获取对话信息
        result = await db.execute(
            select(Conversation).where(Conversation.id == message.conversation_id)
        )
        conversation = result.scalar_one_or_none()
        if conversation is None:
            raise ValueError("对话不存在")

        # 检查是否已收藏
        existing = await self._get_favorite(user_id, message_id, db)
        if existing:
            raise ValueError("已收藏该消息")

        favorite = Favorite(
            user_id=user_id,
            message_id=message_id,
            conversation_id=conversation.id,
            collection_id=conversation.collection_id,
            note=note,
        )
        db.add(favorite)
        await db.flush()
        await db.refresh(favorite)
        return favorite

    async def remove_favorite(
        self,
        user_id: str,
        message_id: str,
        db: AsyncSession,
    ) -> bool:
        """取消收藏，返回是否成功删除"""
        result = await db.execute(
            select(Favorite).where(
                Favorite.user_id == user_id,
                Favorite.message_id == message_id,
            )
        )
        favorite = result.scalar_one_or_none()
        if not favorite:
            return False
        await db.delete(favorite)
        return True

    async def list_favorites(
        self,
        user_id: str,
        collection_id: Optional[str] = None,
        keyword: Optional[str] = None,
        skip: int = 0,
        limit: int = 20,
        db: Optional[AsyncSession] = None,
    ) -> tuple[list[dict], int]:
        """分页查询收藏列表，支持按知识库筛选和关键词搜索

        Returns:
            (items, total) 其中 items 是包含完整信息的字典列表
        """
        # 基础查询：favorite + message + conversation + collection
        base_q = (
            select(
                Favorite.id.label("fav_id"),
                Favorite.message_id,
                Favorite.conversation_id,
                Favorite.collection_id,
                Favorite.note,
                Favorite.created_at,
                Message.content.label("message_content"),
                Collection.name.label("collection_name"),
            )
            .join(Message, Favorite.message_id == Message.id)
            .outerjoin(Collection, Favorite.collection_id == Collection.id)
            .where(Favorite.user_id == user_id)
        )

        if collection_id:
            base_q = base_q.where(Favorite.collection_id == collection_id)

        if keyword:
            kw = f"%{keyword}%"
            base_q = base_q.where(
                Message.content.ilike(kw) | Favorite.note.ilike(kw)
            )

        # 总数
        count_q = select(func.count()).select_from(base_q.subquery())
        total_result = await db.execute(count_q)
        total = total_result.scalar() or 0

        # 分页
        data_q = base_q.order_by(Favorite.created_at.desc()).offset(skip).limit(limit)
        result = await db.execute(data_q)
        rows = result.all()

        # 为每条收藏找到对应的 user 提问（该消息之前的最后一条 user 消息）
        items = []
        for row in rows:
            # 查找该对话中此消息之前的最后一条 user 消息
            user_msg_q = (
                select(Message.content)
                .where(
                    Message.conversation_id == row.conversation_id,
                    Message.role == "user",
                    Message.created_at < (
                        select(Message.created_at).where(Message.id == row.message_id)
                    ),
                )
                .order_by(Message.created_at.desc())
                .limit(1)
            )
            user_msg_result = await db.execute(user_msg_q)
            question_content = user_msg_result.scalar_one_or_none()

            items.append({
                "id": row.fav_id,
                "message_id": row.message_id,
                "conversation_id": row.conversation_id,
                "collection_id": row.collection_id,
                "note": row.note,
                "message_content": row.message_content,
                "question_content": question_content,
                "collection_name": row.collection_name,
                "created_at": row.created_at,
            })

        return items, total

    async def update_note(
        self,
        user_id: str,
        message_id: str,
        note: Optional[str],
        db: AsyncSession,
    ) -> Optional[Favorite]:
        """更新收藏备注"""
        favorite = await self._get_favorite(user_id, message_id, db)
        if not favorite:
            return None
        favorite.note = note
        return favorite

    async def is_favorited(
        self,
        user_id: str,
        message_id: str,
        db: AsyncSession,
    ) -> bool:
        """检查是否已收藏"""
        favorite = await self._get_favorite(user_id, message_id, db)
        return favorite is not None

    async def batch_check_favorited(
        self,
        user_id: str,
        message_ids: list[str],
        db: AsyncSession,
    ) -> dict[str, bool]:
        """批量检查消息是否已收藏，返回 {message_id: bool}"""
        if not message_ids:
            return {}
        result = await db.execute(
            select(Favorite.message_id).where(
                Favorite.user_id == user_id,
                Favorite.message_id.in_(message_ids),
            )
        )
        favorited_ids = set(result.scalars().all())
        return {mid: mid in favorited_ids for mid in message_ids}

    async def get_conversation_has_favorite(
        self,
        user_id: str,
        conversation_id: str,
        db: AsyncSession,
    ) -> bool:
        """检查对话是否含有收藏消息"""
        result = await db.execute(
            select(func.count()).select_from(Favorite).where(
                Favorite.user_id == user_id,
                Favorite.conversation_id == conversation_id,
            )
        )
        return (result.scalar() or 0) > 0

    async def _get_favorite(
        self,
        user_id: str,
        message_id: str,
        db: AsyncSession,
    ) -> Optional[Favorite]:
        """内部：按 user_id + message_id 获取收藏记录"""
        result = await db.execute(
            select(Favorite).where(
                Favorite.user_id == user_id,
                Favorite.message_id == message_id,
            )
        )
        return result.scalar_one_or_none()
