"""标签管理服务"""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import select, func, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Tag, CollectionTag, Collection

logger = logging.getLogger(__name__)


class TagService:
    """标签管理服务"""

    async def list_tags(self, db: AsyncSession) -> tuple[list[dict], int]:
        """查询所有标签，附带每个标签的使用次数（关联知识库数量）"""
        # 子查询：统计每个标签关联的知识库数量
        count_subq = (
            select(
                CollectionTag.tag_id,
                func.count(CollectionTag.collection_id).label("collection_count"),
            )
            .group_by(CollectionTag.tag_id)
            .subquery()
        )

        result = await db.execute(
            select(Tag, func.coalesce(count_subq.c.collection_count, 0).label("collection_count"))
            .outerjoin(count_subq, Tag.id == count_subq.c.tag_id)
            .order_by(Tag.name)
        )
        rows = result.all()

        items = []
        for tag, collection_count in rows:
            items.append({
                "id": tag.id,
                "name": tag.name,
                "color": tag.color,
                "created_by": tag.created_by,
                "collection_count": collection_count,
                "created_at": tag.created_at,
            })

        return items, len(items)

    async def create_tag(
        self,
        name: str,
        color: Optional[str],
        created_by: Optional[str],
        db: AsyncSession,
    ) -> Tag:
        """创建标签（名称去重，大小写不敏感）"""
        # 检查是否已存在（大小写不敏感）
        existing = await db.execute(
            select(Tag).where(func.lower(Tag.name) == name.lower())
        )
        if existing.scalar_one_or_none():
            raise ValueError(f"标签 '{name}' 已存在")

        tag = Tag(
            name=name,
            color=color,
            created_by=created_by,
        )
        db.add(tag)
        await db.flush()
        await db.refresh(tag)
        return tag

    async def update_tag(
        self,
        tag_id: str,
        name: Optional[str],
        color: Optional[str],
        db: AsyncSession,
    ) -> Optional[Tag]:
        """更新标签"""
        result = await db.execute(select(Tag).where(Tag.id == tag_id))
        tag = result.scalar_one_or_none()
        if tag is None:
            return None

        if name is not None:
            # 检查名称冲突（排除自身）
            existing = await db.execute(
                select(Tag).where(
                    func.lower(Tag.name) == name.lower(),
                    Tag.id != tag_id,
                )
            )
            if existing.scalar_one_or_none():
                raise ValueError(f"标签 '{name}' 已存在")
            tag.name = name

        if color is not None:
            tag.color = color

        await db.flush()
        await db.refresh(tag)
        return tag

    async def delete_tag(self, tag_id: str, db: AsyncSession) -> bool:
        """删除标签（级联删除关联）"""
        result = await db.execute(select(Tag).where(Tag.id == tag_id))
        tag = result.scalar_one_or_none()
        if tag is None:
            return False

        await db.delete(tag)
        return True

    async def get_tag(self, tag_id: str, db: AsyncSession) -> Optional[Tag]:
        """获取单个标签"""
        result = await db.execute(select(Tag).where(Tag.id == tag_id))
        return result.scalar_one_or_none()

    async def set_collection_tags(
        self,
        collection_id: str,
        tag_ids: list[str],
        db: AsyncSession,
    ) -> list[Tag]:
        """全量设置知识库的标签（先删后增）"""
        # 删除现有标签关联
        await db.execute(
            sa_delete(CollectionTag).where(
                CollectionTag.collection_id == collection_id
            )
        )

        # 添加新的标签关联
        for tag_id in tag_ids:
            # 验证标签存在
            tag_result = await db.execute(select(Tag).where(Tag.id == tag_id))
            if tag_result.scalar_one_or_none() is None:
                raise ValueError(f"标签 ID {tag_id} 不存在")

            assoc = CollectionTag(collection_id=collection_id, tag_id=tag_id)
            db.add(assoc)

        await db.flush()

        # 返回更新后的标签列表
        return await self.get_collection_tags(collection_id, db)

    async def get_collection_tags(
        self,
        collection_id: str,
        db: AsyncSession,
    ) -> list[Tag]:
        """获取知识库的标签列表"""
        result = await db.execute(
            select(Tag)
            .join(CollectionTag, Tag.id == CollectionTag.tag_id)
            .where(CollectionTag.collection_id == collection_id)
            .order_by(Tag.name)
        )
        return list(result.scalars().all())

    async def filter_collections_by_tags(
        self,
        base_query,
        tag_names: list[str],
        db: AsyncSession,
    ):
        """按标签筛选知识库（AND 逻辑：知识库必须包含所有指定标签）"""
        if not tag_names:
            return base_query

        # 对每个标签名，要求知识库关联了该标签
        for i, tag_name in enumerate(tag_names):
            tag_alias = Tag.__table__.alias(f"t{i}")
            ct_alias = CollectionTag.__table__.alias(f"ct{i}")
            base_query = base_query.join(
                ct_alias,
                base_query.selected_columns[0] == ct_alias.c.collection_id
                if hasattr(base_query.selected_columns, '__getitem__')
                else Collection.id == ct_alias.c.collection_id,
            ).join(
                tag_alias,
                tag_alias.c.id == ct_alias.c.tag_id,
            ).where(
                func.lower(tag_alias.c.name) == tag_name.lower()
            )

        return base_query
