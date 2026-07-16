"""v3 迁移：为 users 表新增 last_login_at 列。

幂等：使用 ADD COLUMN IF NOT EXISTS。"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def migrate_v3_last_login(db: AsyncSession) -> dict:
    """为 users 表新增 last_login_at 列（幂等）。

    Returns:
        dict: {"existed": bool}
    """
    # 先查询列是否存在
    existed_result = await db.execute(
        text("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='users' AND column_name='last_login_at'
            )
        """)
    )
    existed = bool(existed_result.scalar())

    if not existed:
        # ALTER TABLE ADD COLUMN IF NOT EXISTS 自 PostgreSQL 9.6 起支持，
        # 但为了对老版本也幂等，先查后加。
        await db.execute(
            text("""
                ALTER TABLE users
                ADD COLUMN last_login_at TIMESTAMP WITH TIME ZONE
            """)
        )
        logger.info("v3 迁移完成：已添加 users.last_login_at 列")
    else:
        logger.info("v3 迁移：users.last_login_at 已存在，跳过")

    await db.commit()
    return {"existed": existed, "added": not existed}
