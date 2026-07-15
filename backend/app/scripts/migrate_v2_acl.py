"""v2 迁移：为现有 KB 自动创建 owner ACL"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def migrate_v2_acl(db: AsyncSession) -> dict:
    """幂等地从 collections.owner_id 创建 owner ACL。

    Returns:
        dict: {"migrated": int, "orphans": int}
    """
    # 用 PostgreSQL 的 ON CONFLICT DO NOTHING 保证幂等
    result = await db.execute(
        text("""
            INSERT INTO collection_acls (id, collection_id, user_id, role, granted_by)
            SELECT
                gen_random_uuid()::text,
                c.id,
                c.owner_id,
                'owner',
                c.owner_id
            FROM collections c
            WHERE c.owner_id IS NOT NULL
            ON CONFLICT (collection_id, user_id) DO NOTHING
        """)
    )
    migrated = result.rowcount or 0

    # 统计孤儿 KB（无 owner_id）
    orphans_result = await db.execute(
        text("SELECT COUNT(*) FROM collections WHERE owner_id IS NULL")
    )
    orphans = orphans_result.scalar() or 0

    await db.commit()

    logger.info(f"v2 ACL 迁移完成: 迁移 {migrated} 个 KB, {orphans} 个孤儿 KB")
    return {"migrated": migrated, "orphans": orphans}


async def list_orphan_collections(db: AsyncSession) -> list[dict]:
    """列出没有 owner 的 KB（admin 用）"""
    result = await db.execute(
        text("""
            SELECT c.id, c.name, c.created_at
            FROM collections c
            WHERE NOT EXISTS (
                SELECT 1 FROM collection_acls acl
                WHERE acl.collection_id = c.id AND acl.role = 'owner'
            )
        """)
    )
    return [dict(row._mapping) for row in result]