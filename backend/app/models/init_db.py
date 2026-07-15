#!/usr/bin/env python3
"""创建所有数据库表"""

from app.models.database import engine
from app.models.document import Base, Document, Collection, User, Conversation, Message
from app.models.acl import CollectionACL, AuditLog  # noqa: F401  注册到 Base.metadata


async def create_tables():
    """创建所有表"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def drop_tables():
    """删除所有表"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
