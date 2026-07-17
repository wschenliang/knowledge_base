"""v6 迁移：给 ``documents`` 表新增 ``uploader_id`` 列。

幂等：先检查列是否存在，再决定 ADD；多次执行不会出错。
支持 ``--rollback`` 参数回滚。

启动方式：
    cd backend && .venv/Scripts/python scripts/migrate_v6_uploader.py
    cd backend && .venv/Scripts/python scripts/migrate_v6_uploader.py --rollback
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# 让本脚本既能被 ``app/main.py`` 调用，也能从 ``backend/`` 目录直接 CLI 跑
_BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.models.database import async_session  # noqa: E402

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


async def _has_column(db: AsyncSession, table: str, column: str) -> bool:
    rows = await db.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return rows.first() is not None


async def _has_index(db: AsyncSession, index_name: str) -> bool:
    rows = await db.execute(
        text("SELECT 1 FROM pg_indexes WHERE indexname = :n"),
        {"n": index_name},
    )
    return rows.first() is not None


async def _has_constraint(db: AsyncSession, constraint_name: str) -> bool:
    rows = await db.execute(
        text(
            "SELECT 1 FROM information_schema.table_constraints "
            "WHERE constraint_name = :n"
        ),
        {"n": constraint_name},
    )
    return rows.first() is not None


async def apply(db: AsyncSession) -> dict:
    summary = {"column_added": False, "index_added": False, "fk_added": False}

    if not await _has_column(db, "documents", "uploader_id"):
        await db.execute(
            text("ALTER TABLE documents ADD COLUMN uploader_id VARCHAR(36)")
        )
        summary["column_added"] = True
        logger.info("v6 迁移：已添加 documents.uploader_id 列")
    else:
        logger.info("v6 迁移：documents.uploader_id 已存在，跳过 ADD COLUMN")

    if not await _has_index(db, "ix_documents_uploader_id"):
        await db.execute(
            text("CREATE INDEX ix_documents_uploader_id ON documents(uploader_id)")
        )
        summary["index_added"] = True
        logger.info("v6 迁移：已创建 ix_documents_uploader_id 索引")
    else:
        logger.info("v6 迁移：ix_documents_uploader_id 已存在，跳过 CREATE INDEX")

    if not await _has_constraint(db, "fk_documents_uploader_id"):
        await db.execute(
            text(
                "ALTER TABLE documents ADD CONSTRAINT fk_documents_uploader_id "
                "FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE SET NULL"
            )
        )
        summary["fk_added"] = True
        logger.info("v6 迁移：已创建 fk_documents_uploader_id 外键")
    else:
        logger.info("v6 迁移：fk_documents_uploader_id 已存在，跳过 ADD CONSTRAINT")

    await db.commit()
    return summary


async def rollback(db: AsyncSession) -> dict:
    summary = {"fk_dropped": False, "index_dropped": False, "column_dropped": False}

    if await _has_constraint(db, "fk_documents_uploader_id"):
        await db.execute(
            text("ALTER TABLE documents DROP CONSTRAINT fk_documents_uploader_id")
        )
        summary["fk_dropped"] = True
        logger.info("v6 回滚：已删除 fk_documents_uploader_id 外键")

    if await _has_index(db, "ix_documents_uploader_id"):
        await db.execute(text("DROP INDEX ix_documents_uploader_id"))
        summary["index_dropped"] = True
        logger.info("v6 回滚：已删除 ix_documents_uploader_id 索引")

    if await _has_column(db, "documents", "uploader_id"):
        await db.execute(text("ALTER TABLE documents DROP COLUMN uploader_id"))
        summary["column_dropped"] = True
        logger.info("v6 回滚：已删除 documents.uploader_id 列")

    await db.commit()
    return summary


async def main(do_rollback: bool) -> int:
    async with async_session() as db:
        if do_rollback:
            await rollback(db)
        else:
            await apply(db)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="v6 迁移：documents.uploader_id")
    parser.add_argument("--rollback", action="store_true", help="回滚迁移")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(do_rollback=args.rollback)))