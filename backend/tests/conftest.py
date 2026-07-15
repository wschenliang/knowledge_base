"""共享测试 fixtures — 使用 PostgreSQL 临时 schema 隔离测试数据。

设计要点:
- 启动一次测试 session，分配独立 schema ``kb_test_<random>``。
- 在该 schema 中建表，避免与生产数据冲突。
- 通过 ``get_db`` 依赖注入覆盖，把所有 SQL 路由到测试 schema。
- 通过 ``ASGITransport`` 直接驱动 FastAPI app，避免外部 HTTP 服务器。
- ``alice`` / ``bob`` / ``admin`` 等 factory fixtures 提供基础数据。
"""

from __future__ import annotations

import os
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://kbuser:kbpass@localhost:5432/knowledge_base",
)

from app.auth import hash_password  # noqa: E402
from app.models.database import get_db  # noqa: E402
from app.models.document import Base, User  # noqa: E402
# 显式 import 以下子模块以触发 ORM 模型注册（否则 Base.metadata 中缺失 ACL 表）
from app.models import acl as _acl_models  # noqa: E402,F401

TEST_SCHEMA = f"kb_test_{uuid.uuid4().hex[:8]}"
TEST_DB_URL = os.environ["DATABASE_URL"]


@pytest.fixture(scope="session")
def test_schema() -> str:
    return TEST_SCHEMA


@pytest_asyncio.fixture(scope="session")
async def engine(test_schema: str):
    """一次性 AsyncEngine，使用 ``schema_translate_map`` 将所有无 schema 前缀的
    SQL 重新映射到测试 schema。这样所有 DDL / DML / FK 引用都路由到测试 schema。
    """
    eng = create_async_engine(
        TEST_DB_URL,
        poolclass=NullPool,
        execution_options={"schema_translate_map": {None: test_schema}},
    )

    async with eng.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{test_schema}"'))
        await conn.commit()
    # 显式为所有表设置 schema（让 DDL 建在测试 schema 下）
    for table in Base.metadata.tables.values():
        table.schema = test_schema
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    try:
        async with eng.begin() as conn:
            await conn.execute(text(f'DROP SCHEMA IF EXISTS "{test_schema}" CASCADE'))
    finally:
        await eng.dispose()


@pytest_asyncio.fixture
async def db(engine) -> AsyncIterator[AsyncSession]:
    """每次测试给一个新 session，并清空测试 schema。

    直接 drop_schema + recreate 简单可靠，避免 TRUNCATE 跨表外键问题。
    """
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    # 重新建 schema：drop + create
    async with engine.begin() as conn:
        await conn.execute(text(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE'))
        await conn.execute(text(f'CREATE SCHEMA "{TEST_SCHEMA}"'))
        for table in Base.metadata.tables.values():
            table.schema = TEST_SCHEMA
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def _create_user(
    db: AsyncSession,
    username: str,
    password: str = "password",
    role: str = "user",
    display_name: str | None = None,
) -> User:
    user = User(
        username=username,
        hashed_password=hash_password(password),
        display_name=display_name or username,
        role=role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def alice(db) -> User:
    return await _create_user(db, "alice", "password", role="user", display_name="Alice")


@pytest_asyncio.fixture
async def bob(db) -> User:
    return await _create_user(db, "bob", "password", role="user", display_name="Bob")


@pytest_asyncio.fixture
async def admin(db) -> User:
    return await _create_user(db, "admin", "admin", role="admin", display_name="Admin")


@pytest_asyncio.fixture
async def client(engine) -> AsyncIterator[AsyncClient]:
    """启动 FastAPI app，把 ``get_db`` 覆盖到测试 schema 的 session。"""
    from app.main import app

    import app.models.database as db_module
    original_engine = db_module.engine
    original_session = db_module.async_session

    db_module.engine = engine
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    db_module.async_session = SessionLocal

    async def override_get_db() -> AsyncIterator[AsyncSession]:
        async with SessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()

    app.dependency_overrides[get_db] = override_get_db

    @asynccontextmanager
    async def noop_lifespan(_app):
        yield

    app.router.lifespan_context = noop_lifespan

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
    db_module.engine = original_engine
    db_module.async_session = original_session


async def login(client: AsyncClient, username: str, password: str) -> str:
    resp = await client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, f"login failed: {resp.status_code} {resp.text}"
    return resp.json()["access_token"]


@pytest_asyncio.fixture
async def alice_token(client: AsyncClient, alice: User) -> str:
    return await login(client, "alice", "password")


@pytest_asyncio.fixture
async def bob_token(client: AsyncClient, bob: User) -> str:
    return await login(client, "bob", "password")


@pytest_asyncio.fixture
async def admin_token(client: AsyncClient, admin: User) -> str:
    return await login(client, "admin", "admin")
