"""v5 迁移：新增 ``email_verification_codes`` 表（注册邮箱验证码）。

幂等：先查后建，多次执行不会出错。
"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def migrate_v5_email_verification(db: AsyncSession) -> dict:
    """创建邮箱验证码表。

    Returns:
        dict: {"table_created": bool}
    """
    summary = {"table_created": False}

    tbl_result = await db.execute(
        text("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name='email_verification_codes'
            )
        """)
    )
    has_table = bool(tbl_result.scalar())
    if not has_table:
        await db.execute(
            text("""
                CREATE TABLE email_verification_codes (
                    id VARCHAR(36) PRIMARY KEY,
                    email VARCHAR(255) NOT NULL,
                    code_hash VARCHAR(64) NOT NULL,
                    purpose VARCHAR(32) NOT NULL DEFAULT 'register',
                    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    consumed_at TIMESTAMP WITH TIME ZONE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            """)
        )
        # 单列索引 + 组合查询索引
        await db.execute(
            text("CREATE INDEX idx_email_verif_email ON email_verification_codes (email)")
        )
        await db.execute(
            text(
                "CREATE INDEX idx_email_verif_purpose_time "
                "ON email_verification_codes (email, purpose, created_at)"
            )
        )
        summary["table_created"] = True
        logger.info("v5 迁移：已创建 email_verification_codes 表")
    else:
        logger.info("v5 迁移：email_verification_codes 已存在，跳过")

    await db.commit()
    return summary
