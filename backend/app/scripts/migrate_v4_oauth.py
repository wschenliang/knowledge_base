"""v4 迁移：为 users 加 password_set 列 + 新增 oauth_accounts 子表。

幂等：先查后加；多次执行不会出错。"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def migrate_v4_oauth(db: AsyncSession) -> dict:
    """为 OAuth 第三方登录补齐数据库 schema。

    Returns:
        dict: {"password_set_added": bool, "oauth_table_created": bool}
    """
    summary = {"password_set_added": False, "oauth_table_created": False}

    # 1) users.password_set
    col_result = await db.execute(
        text("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name='users' AND column_name='password_set'
            )
        """)
    )
    has_col = bool(col_result.scalar())
    if not has_col:
        # DEFAULT TRUE 让历史用户默认视为已设过密码（保留原有登入能力）。
        await db.execute(
            text("ALTER TABLE users ADD COLUMN password_set BOOLEAN DEFAULT TRUE")
        )
        summary["password_set_added"] = True
        logger.info("v4 迁移：已添加 users.password_set 列（默认 TRUE）")
    else:
        logger.info("v4 迁移：users.password_set 已存在，跳过")

    # 2) oauth_accounts 表
    tbl_result = await db.execute(
        text("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name='oauth_accounts'
            )
        """)
    )
    has_table = bool(tbl_result.scalar())
    if not has_table:
        # 由于历史原因采用 INHERITS-like 拆表不必要；直接用单表 + 复合唯一约束实现。
        await db.execute(
            text("""
                CREATE TABLE oauth_accounts (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    provider VARCHAR(32) NOT NULL,
                    provider_user_id VARCHAR(255) NOT NULL,
                    provider_email VARCHAR(255),
                    provider_display_name VARCHAR(255),
                    avatar_url TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    CONSTRAINT uq_oauth_provider_user UNIQUE (provider, provider_user_id)
                )
            """)
        )
        await db.execute(
            text("CREATE INDEX idx_oauth_user ON oauth_accounts (user_id)")
        )
        summary["oauth_table_created"] = True
        logger.info("v4 迁移：已创建 oauth_accounts 表")
    else:
        logger.info("v4 迁移：oauth_accounts 已存在，跳过")

    await db.commit()
    return summary
