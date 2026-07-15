# 细粒度权限控制 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在企业知识库中实现 Owner / Editor / Viewer 三级知识库级权限控制，解决当前"任何登录用户可访问所有 KB"的安全问题。

**Architecture:** 后端采用扁平 ACL 表（`collection_acls` + `audit_logs`），FastAPI `Depends` 注入实现权限声明；前端通过角色徽章和成员管理 Tab 提供可见性；权限实时计算（不缓存到 JWT）。

**Tech Stack:**
- 后端：FastAPI + SQLAlchemy 2.0 async + Pydantic v2 + PostgreSQL
- 前端：Next.js 16 + React 19 + TypeScript + Tailwind v4
- 测试：pytest（后端）+ 手动 + 浏览器集成测试

**Spec Reference:** [docs/superpowers/specs/2026-07-14-fine-grained-permission-control-design.md](../../specs/2026-07-14-fine-grained-permission-control-design.md)

---

## 文件结构（先定义边界）

### 新增文件

| 文件 | 职责 |
|------|------|
| `backend/app/models/acl.py` | `CollectionACL` / `AuditLog` ORM 模型 |
| `backend/app/services/permission_service.py` | `PermissionService`：grant / revoke / update_role / transfer / list_members / accessible_collections |
| `backend/app/api/acl.py` | 6 个 ACL 管理端点（挂在 `/api/v1/collections/{coll_id}/acl`） |
| `backend/app/api/admin.py` | `/api/v1/admin/audit-logs` admin-only 端点 |
| `backend/app/schemas/acl.py` | ACL 请求/响应 Pydantic 模型 |
| `backend/app/scripts/migrate_v2_acl.py` | 一次性迁移脚本（也可启动钩子自动调用） |
| `backend/tests/test_acl_service.py` | 单元测试 |
| `backend/tests/test_permissions_dep.py` | 依赖测试 |
| `backend/tests/test_migration.py` | 迁移测试 |
| `frontend/src/components/RoleBadge.tsx` | 角色徽章（Owner/Editor/Viewer） |
| `frontend/src/components/CollectionMemberManager.tsx` | 成员管理 Tab 内容 |
| `frontend/src/components/InviteMemberDialog.tsx` | 邀请成员对话框 |
| `frontend/src/lib/permissions.ts` | 前端角色工具函数（hasRole / isAdmin） |

### 修改文件

| 文件 | 改动 |
|------|------|
| `backend/app/auth/permissions.py` | 新增 `require_collection_role` 依赖 |
| `backend/app/models/init_db.py` | 启动时调用迁移脚本 |
| `backend/app/models/document.py` | 从 ORM 模型移除 `is_public` 字段（DB 列保留） |
| `backend/app/api/collections.py` | 所有端点加权限检查 + 删除时级联清理 ACL |
| `backend/app/api/documents.py` | 上传 / 删除 / 列出加权限检查 |
| `backend/app/api/chat.py` | chat + chat_stream 加 viewer+ 检查 |
| `backend/app/api/search.py` | 搜索加 viewer+ 检查 |
| `backend/app/services/document_service.py` | 删除 KB 时级联删除 ACL 与文档 |
| `frontend/src/lib/api.ts` | 新增 6 个 ACL 方法 + 1 个 audit-logs 方法 |
| `frontend/src/types/index.ts` | 新增 `CollectionMember` / `AclRole` / `AuditLog` 类型 |
| `frontend/src/components/CollectionCard.tsx` | 加角色徽章 |
| `frontend/src/app/collections/[id]/page.tsx` | 加"成员"Tab |
| `frontend/src/app/dashboard/page.tsx` | 已自动过滤，无需改 |

---

## 任务依赖图

```
Task 1 (数据模型)
   ↓
Task 2 (迁移脚本)
   ↓
Task 3 (PermissionService)
   ↓
Task 4 (require_collection_role 依赖)
   ↓
   ├── Task 5 (改造 GET /collections 过滤)
   ├── Task 6 (6 个新 ACL 端点)
   ├── Task 7 (documents 权限检查)
   ├── Task 8 (chat/search 权限检查)
   └── Task 9 (admin 审计日志)
   ↓
Task 10 (前端类型 + API)
   ↓
Task 11 (前端 3 个新组件)
   ↓
Task 12 (前端集成)
   ↓
Task 13 (端到端测试)
```

---

## Task 1: 数据模型（CollectionACL + AuditLog）

**Files:**
- Create: `backend/app/models/acl.py`
- Modify: `backend/app/models/document.py:1-15`（删除 `is_public` 引用，保留 DB 列）

- [ ] **Step 1: 创建 CollectionACL 模型**

创建 `backend/app/models/acl.py`：

```python
"""细粒度权限控制模型"""

from __future__ import annotations

import datetime
import uuid
from typing import Optional

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.document import Base


class CollectionACL(Base):
    """知识库访问控制列表"""

    __tablename__ = "collection_acls"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    collection_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("collections.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # owner|editor|viewer
    granted_by: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("uq_collection_user", "collection_id", "user_id", unique=True),
        Index("idx_acl_user", "user_id"),
        Index("idx_acl_collection", "collection_id"),
    )

    def __repr__(self) -> str:
        return f"<CollectionACL(coll={self.collection_id}, user={self.user_id}, role={self.role})>"


class AuditLog(Base):
    """操作审计日志"""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(20), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(36), nullable=False)
    detail: Mapped[Optional[dict]] = mapped_column(JSONB)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    user_agent: Mapped[Optional[str]] = mapped_column(String(500))
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("idx_audit_user_time", "user_id", "created_at"),
        Index("idx_audit_resource", "resource_type", "resource_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<AuditLog(id={self.id}, action={self.action}, resource={self.resource_id})>"
```

- [ ] **Step 2: 从 Collection 模型移除 `is_public`**

修改 `backend/app/models/document.py`，在 `Collection` 类（约第 68 行）中**删除**：

```python
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
```

数据库列保留（项目用 `create_all` 不删列），只是 ORM 不再加载/写入它。

- [ ] **Step 3: 让 init_db 知道新模型**

修改 `backend/app/models/init_db.py`，导入新模型确保 `create_all` 会建表：

```python
from app.models.database import engine
from app.models.document import Base, Document, Collection, User, Conversation, Message
from app.models.acl import CollectionACL, AuditLog  # 新增
```

- [ ] **Step 4: 创建表并验证**

```bash
cd backend && .venv\Scripts\python.exe -c "
import asyncio
from app.models.init_db import create_tables

asyncio.run(create_tables())
print('✓ Tables created')
"
```

预期：打印 `✓ Tables created`，且 PostgreSQL 中存在 `collection_acls` 和 `audit_logs` 表。

- [ ] **Step 5: 提交**

```bash
git add backend/app/models/acl.py backend/app/models/document.py backend/app/models/init_db.py
git commit -m "feat(acl): 添加 CollectionACL 和 AuditLog 模型"
```

---

## Task 2: 数据迁移脚本

**Files:**
- Create: `backend/app/scripts/__init__.py`
- Create: `backend/app/scripts/migrate_v2_acl.py`
- Modify: `backend/app/main.py`（启动时调用迁移）

- [ ] **Step 1: 创建 scripts 包**

创建 `backend/app/scripts/__init__.py`（空文件）。

- [ ] **Step 2: 实现迁移函数**

创建 `backend/app/scripts/migrate_v2_acl.py`：

```python
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
```

- [ ] **Step 3: 在 main.py 启动钩子调用迁移**

修改 `backend/app/main.py`：在 `app = FastAPI(...)` 之后、`@app.on_event("startup")` 中添加：

```python
from app.models.database import async_session
from app.scripts.migrate_v2_acl import migrate_v2_acl

@app.on_event("startup")
async def on_startup():
    """应用启动时执行迁移"""
    async with async_session() as db:
        result = await migrate_v2_acl(db)
        print(f"[migration] v2 ACL: migrated={result['migrated']}, orphans={result['orphans']}")
```

（如果 main.py 已有 startup 钩子，直接把迁移逻辑并入即可。）

- [ ] **Step 4: 手动运行迁移验证**

```bash
cd backend && .venv\Scripts\python.exe -c "
import asyncio
from app.models.database import async_session
from app.scripts.migrate_v2_acl import migrate_v2_acl
result = asyncio.run(migrate_v2_acl(async_session().__aenter__()))
print(result)
"
```

预期：打印 `{'migrated': N, 'orphans': N}`，N 为已有 KB 数（owner_id 非空）。

- [ ] **Step 5: 验证幂等性**

再次运行 Step 4 的命令。预期：`migrated=0`（不再迁移）。

- [ ] **Step 6: 提交**

```bash
git add backend/app/scripts/ backend/app/main.py
git commit -m "feat(acl): 添加 v2 ACL 迁移脚本"
```

---

## Task 3: PermissionService（核心服务层）

**Files:**
- Create: `backend/app/services/permission_service.py`

- [ ] **Step 1: 实现服务骨架**

创建 `backend/app/services/permission_service.py`：

```python
"""权限服务：所有 ACL 操作的中心枢纽"""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import and_, delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.acl import AuditLog, CollectionACL
from app.models.document import Collection, User

logger = logging.getLogger(__name__)


# 角色优先级：数字大 = 权限高
ROLE_PRIORITY = {"owner": 3, "editor": 2, "viewer": 1}


class PermissionService:
    """细粒度权限管理服务"""

    # ---------- 查询 ----------

    async def get_role(
        self, user_id: str, collection_id: str, db: AsyncSession
    ) -> Optional[str]:
        """获取用户对某 KB 的角色；无权限返回 None"""
        result = await db.execute(
            select(CollectionACL.role).where(
                CollectionACL.collection_id == collection_id,
                CollectionACL.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_members(
        self, collection_id: str, db: AsyncSession
    ) -> list[dict]:
        """列出 KB 所有成员（含用户名）"""
        result = await db.execute(
            select(
                CollectionACL.id,
                CollectionACL.user_id,
                CollectionACL.role,
                CollectionACL.granted_by,
                CollectionACL.created_at,
                User.username,
                User.display_name,
            )
            .join(User, User.id == CollectionACL.user_id)
            .where(CollectionACL.collection_id == collection_id)
            .order_by(CollectionACL.role.desc(), CollectionACL.created_at.asc())
        )
        return [dict(row._mapping) for row in result]

    async def accessible_collections(
        self, user: User, db: AsyncSession, skip: int = 0, limit: int = 100
    ) -> tuple[list[Collection], int]:
        """获取当前用户可访问的所有 KB（admin 看全部）"""
        # Admin 看全部
        if user.role == "admin":
            total_result = await db.execute(select(Collection.id).order_by(None))
            total = len(total_result.scalars().all())
            result = await db.execute(
                select(Collection)
                .order_by(Collection.created_at.desc())
                .offset(skip)
                .limit(limit)
            )
            return list(result.scalars().all()), total

        # 普通用户只返回有 ACL 关联的
        from sqlalchemy import func as sa_func
        total_q = (
            select(sa_func.count(Collection.id))
            .join(CollectionACL, CollectionACL.collection_id == Collection.id)
            .where(CollectionACL.user_id == user.id)
        )
        total = (await db.execute(total_q)).scalar() or 0

        result = await db.execute(
            select(Collection)
            .join(CollectionACL, CollectionACL.collection_id == Collection.id)
            .where(CollectionACL.user_id == user.id)
            .order_by(Collection.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(result.scalars().all()), total

    # ---------- 修改 ----------

    async def grant(
        self,
        collection_id: str,
        user_id: str,
        role: str,
        granted_by: str,
        db: AsyncSession,
    ) -> CollectionACL:
        """授予权限（role 必须是 editor 或 viewer；owner 通过 transfer 转移）"""
        if role not in ("editor", "viewer"):
            raise ValueError(f"grant() 只支持 editor/viewer；role={role}")

        # 检查重复
        existing = await self.get_role(user_id, collection_id, db)
        if existing:
            raise ValueError(f"该用户已是成员（role={existing}）")

        acl = CollectionACL(
            collection_id=collection_id,
            user_id=user_id,
            role=role,
            granted_by=granted_by,
        )
        db.add(acl)
        await db.flush()
        await db.refresh(acl)
        return acl

    async def revoke(
        self, collection_id: str, user_id: str, db: AsyncSession
    ) -> bool:
        """移除成员（owner 不可移除）"""
        role = await self.get_role(user_id, collection_id, db)
        if not role:
            return False
        if role == "owner":
            raise ValueError("不能移除 owner，请先转移所有权")

        await db.execute(
            delete(CollectionACL).where(
                CollectionACL.collection_id == collection_id,
                CollectionACL.user_id == user_id,
            )
        )
        return True

    async def update_role(
        self,
        collection_id: str,
        user_id: str,
        new_role: str,
        db: AsyncSession,
    ) -> CollectionACL:
        """修改成员角色（owner 不可直接降级）"""
        if new_role not in ("owner", "editor", "viewer"):
            raise ValueError(f"无效 role: {new_role}")

        current = await self.get_role(user_id, collection_id, db)
        if current == "owner" and new_role != "owner":
            raise ValueError("不能修改 owner 角色，请使用所有权转移")

        acl_result = await db.execute(
            select(CollectionACL).where(
                CollectionACL.collection_id == collection_id,
                CollectionACL.user_id == user_id,
            )
        )
        acl = acl_result.scalar_one_or_none()
        if not acl:
            raise ValueError("用户不是知识库成员")
        acl.role = new_role
        await db.flush()
        return acl

    async def transfer_ownership(
        self,
        collection_id: str,
        current_owner_id: str,
        new_owner_id: str,
        db: AsyncSession,
    ) -> None:
        """所有权转移：原 owner → editor；目标 → owner"""
        if current_owner_id == new_owner_id:
            raise ValueError("不能将所有权转移给自己")

        # 检查 new_owner 是否已是成员
        new_owner_role = await self.get_role(new_owner_id, collection_id, db)
        if not new_owner_role:
            raise ValueError("目标用户不是知识库成员")

        # 用单个事务内的两次 update 保证原子性
        await db.execute(
            update(CollectionACL)
            .where(
                CollectionACL.collection_id == collection_id,
                CollectionACL.user_id == current_owner_id,
            )
            .values(role="editor")
        )
        await db.execute(
            update(CollectionACL)
            .where(
                CollectionACL.collection_id == collection_id,
                CollectionACL.user_id == new_owner_id,
            )
            .values(role="owner")
        )
        await db.flush()

    # ---------- 审计 ----------

    async def audit(
        self,
        user_id: str,
        action: str,
        resource_type: str,
        resource_id: str,
        detail: Optional[dict] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        db: AsyncSession = None,
    ) -> AuditLog:
        """记录审计日志"""
        log = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            detail=detail,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        if db:
            db.add(log)
            await db.flush()
        return log
```

- [ ] **Step 2: 编写服务层单元测试**

创建 `backend/tests/test_acl_service.py`：

```python
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.acl import CollectionACL
from app.models.document import Collection, User
from app.services.permission_service import PermissionService, ROLE_PRIORITY


@pytest.mark.asyncio
async def test_grant_creates_acl(db_session: AsyncSession, owner: User, viewer: User):
    svc = PermissionService()
    collection = Collection(name="test", qdrant_collection="q_test", owner_id=owner.id)
    db_session.add(collection)
    await db_session.flush()

    acl = await svc.grant(
        collection_id=collection.id,
        user_id=viewer.id,
        role="editor",
        granted_by=owner.id,
        db=db_session,
    )

    assert acl.id is not None
    assert acl.role == "editor"
    assert (await svc.get_role(viewer.id, collection.id, db_session)) == "editor"


@pytest.mark.asyncio
async def test_grant_rejects_owner_role(db_session, owner, viewer):
    svc = PermissionService()
    with pytest.raises(ValueError, match="grant"):
        await svc.grant("c1", viewer.id, "owner", owner.id, db_session)


@pytest.mark.asyncio
async def test_revoke_blocks_owner(db_session, owner):
    svc = PermissionService()
    collection = Collection(name="t", qdrant_collection="qt", owner_id=owner.id)
    db_session.add(collection)
    await svc.grant_or_skip(collection.id, owner.id, db_session)  # helper fixture
    with pytest.raises(ValueError, match="不能移除 owner"):
        await svc.revoke(collection.id, owner.id, db_session)


@pytest.mark.asyncio
async def test_transfer_ownership_swaps_roles(db_session, owner, editor):
    svc = PermissionService()
    collection = Collection(name="t", qdrant_collection="qt", owner_id=owner.id)
    db_session.add(collection)
    await db_session.flush()
    await svc.grant(collection.id, editor.id, "editor", owner.id, db_session)

    await svc.transfer_ownership(collection.id, owner.id, editor.id, db_session)

    assert (await svc.get_role(owner.id, collection.id, db_session)) == "editor"
    assert (await svc.get_role(editor.id, collection.id, db_session)) == "owner"


@pytest.mark.asyncio
async def test_transfer_to_self_rejected(db_session, owner):
    svc = PermissionService()
    with pytest.raises(ValueError, match="不能将所有权转移给自己"):
        await svc.transfer_ownership("c1", owner.id, owner.id, db_session)
```

- [ ] **Step 3: 提交**

```bash
git add backend/app/services/permission_service.py backend/tests/test_acl_service.py
git commit -m "feat(acl): 实现 PermissionService 核心逻辑"
```

---

## Task 4: require_collection_role 依赖

**Files:**
- Modify: `backend/app/auth/permissions.py`

- [ ] **Step 1: 添加依赖函数**

修改 `backend/app/auth/permissions.py`，追加：

```python
"""权限依赖"""

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_current_user
from app.models.database import get_db
from app.models.document import Collection, User
from app.services.permission_service import PermissionService, ROLE_PRIORITY


async def require_admin(current_user: User = Depends(get_current_user)):
    """要求管理员权限"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限",
        )
    return current_user


async def require_collection_role(
    request: Request,
    min_role: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> tuple[User, Collection]:
    """要求用户对某 KB 拥有指定级别或更高级别权限。

    自动从 request.path_params 提取 collection_id（兼容 `/collections/{collection_id}/...`
    或 `/documents/{document_id}` 之类路径，需要端点传入 collection_id 路径参数）。

    Args:
        min_role: 'viewer' | 'editor' | 'owner'

    Returns:
        (current_user, collection)

    Raises:
        HTTPException 403 / 404
    """
    if min_role not in ROLE_PRIORITY:
        raise ValueError(f"Invalid min_role: {min_role}")

    # Admin 直接放行
    if current_user.role == "admin":
        # 仍需返回 collection 对象
        collection_id = request.path_params.get("collection_id")
        if not collection_id:
            return current_user, None  # type: ignore
        from sqlalchemy import select
        result = await db.execute(
            select(Collection).where(Collection.id == collection_id)
        )
        return current_user, result.scalar_one_or_none()

    # 路径参数提取 collection_id
    collection_id = request.path_params.get("collection_id")
    if not collection_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无法从路径提取 collection_id",
        )

    # 获取 collection
    from sqlalchemy import select
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id)
    )
    collection = result.scalar_one_or_none()
    if collection is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="知识库不存在",
        )

    # 检查 ACL
    svc = PermissionService()
    user_role = await svc.get_role(current_user.id, collection_id, db)
    if not user_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问该知识库",
        )

    if ROLE_PRIORITY[user_role] < ROLE_PRIORITY[min_role]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"需要 {min_role} 或更高权限",
        )

    return current_user, collection
```

- [ ] **Step 2: 验证 Python 语法**

```bash
cd backend && .venv\Scripts\python.exe -c "from app.auth.permissions import require_collection_role; print('OK')"
```

预期：打印 `OK`。

- [ ] **Step 3: 提交**

```bash
git add backend/app/auth/permissions.py
git commit -m "feat(acl): 添加 require_collection_role 依赖"
```

---

## Task 5: 改造 GET /collections 过滤

**Files:**
- Modify: `backend/app/api/collections.py`
- Modify: `backend/app/services/document_service.py`（修改 `list_collections`）

- [ ] **Step 1: 修改 document_service.list_collections 接收 user 参数**

修改 `backend/app/services/document_service.py` 的 `list_collections` 方法（约第 88 行）：

```python
    async def list_collections(
        self, db: AsyncSession, user: Optional[User] = None, skip: int = 0, limit: int = 100
    ) -> tuple[list[Collection], int]:
        """列出知识库集合

        - 如果传入 user：admin 看全部；普通用户仅看自己有 ACL 的
        - 不传 user：旧行为，返回全部（保留向后兼容）
        """
        from app.services.permission_service import PermissionService
        if user:
            return await PermissionService().accessible_collections(user, db, skip, limit)

        total_result = await db.execute(select(func.count(Collection.id)))
        total = total_result.scalar()
        result = await db.execute(
            select(Collection).offset(skip).limit(limit).order_by(Collection.created_at.desc())
        )
        return list(result.scalars().all()), total
```

（注意顶部 import 需要加 `User`：`from app.models.document import Document, Collection, User`）

- [ ] **Step 2: 修改 collections.py 端点**

修改 `backend/app/api/collections.py` 的 `list_collections` 端点（约第 40 行）：

```python
@router.get("", response_model=CollectionList)
async def list_collections(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """列出知识库集合（admin 看全部，普通用户仅看自己有 ACL 的）"""
    collections, total = await document_service.list_collections(
        db=db, user=current_user, skip=skip, limit=limit
    )
    return CollectionList(
        items=[CollectionResponse.model_validate(c) for c in collections],
        total=total,
    )
```

- [ ] **Step 3: 启动后端并验证**

```bash
cd backend && .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

另开终端：

```bash
# 登录 admin
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

# 列出 KB，应该看到全部
curl -s http://localhost:8000/api/v1/collections -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

预期：admin 用户能看到所有 KB。

- [ ] **Step 4: 提交**

```bash
git add backend/app/api/collections.py backend/app/services/document_service.py
git commit -m "feat(acl): GET /collections 过滤为仅返回可访问 KB"
```

---

## Task 6: ACL 管理 API（6 个新端点）

**Files:**
- Create: `backend/app/schemas/acl.py`
- Create: `backend/app/api/acl.py`
- Modify: `backend/app/main.py`（注册路由）

- [ ] **Step 1: 创建 Pydantic schemas**

创建 `backend/app/schemas/acl.py`：

```python
"""ACL 相关 Pydantic 模型"""

from __future__ import annotations

import datetime
from typing import Optional
from pydantic import BaseModel, Field


class ACLInviteRequest(BaseModel):
    """邀请新成员请求"""
    username: str = Field(..., min_length=1, max_length=100)
    role: str = Field(..., pattern="^(editor|viewer)$")


class ACLUpdateRequest(BaseModel):
    """修改角色请求"""
    role: str = Field(..., pattern="^(owner|editor|viewer)$")


class ACLTransferRequest(BaseModel):
    """所有权转移请求"""
    new_owner_username: str = Field(..., min_length=1, max_length=100)


class ACLMemberResponse(BaseModel):
    """成员信息响应"""
    id: str
    user_id: str
    username: str
    display_name: Optional[str] = None
    role: str
    granted_by: Optional[str] = None
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class ACLMemberList(BaseModel):
    items: list[ACLMemberResponse]
    total: int
```

- [ ] **Step 2: 创建 ACL 路由**

创建 `backend/app/api/acl.py`：

```python
"""ACL 管理 API"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_current_user
from app.auth.permissions import require_collection_role
from app.models.database import get_db
from app.models.document import Collection, User
from app.schemas.acl import (
    ACLInviteRequest,
    ACLMemberList,
    ACLMemberResponse,
    ACLTransferRequest,
    ACLUpdateRequest,
)
from app.services.permission_service import PermissionService

logger = logging.getLogger(__name__)


async def _username_to_user_id(username: str, db: AsyncSession) -> str:
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"用户不存在: {username}",
        )
    return user.id


@router := APIRouter(prefix="/api/v1/collections/{collection_id}/acl", tags=["ACL"])  # noqa: E999


# 由于上面 @router 语法糖在 Python 中不可用，请使用下方显式 router 声明
router = APIRouter(prefix="/api/v1/collections/{collection_id}/acl", tags=["ACL"])
permission_service = PermissionService()


@router.get("", response_model=ACLMemberList)
async def list_members(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """查看 KB 成员列表（需要 owner 权限）"""
    await require_collection_role(
        request, min_role="owner", db=db, current_user=current_user
    )

    members = await permission_service.list_members(
        collection_id=request.path_params["collection_id"], db=db
    )
    return ACLMemberList(
        items=[ACLMemberResponse(**m) for m in members],
        total=len(members),
    )


@router.post("", response_model=ACLMemberResponse, status_code=status.HTTP_201_CREATED)
async def invite_member(
    request: Request,
    body: ACLInviteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """邀请新成员（需要 owner 权限）"""
    await require_collection_role(
        request, min_role="owner", db=db, current_user=current_user
    )

    collection_id = request.path_params["collection_id"]
    target_user_id = await _username_to_user_id(body.username, db)

    try:
        acl = await permission_service.grant(
            collection_id=collection_id,
            user_id=target_user_id,
            role=body.role,
            granted_by=current_user.id,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

    # 审计
    await permission_service.audit(
        user_id=current_user.id,
        action="acl.grant",
        resource_type="collection",
        resource_id=collection_id,
        detail={"target_user": body.username, "role": body.role},
        db=db,
    )
    await db.commit()

    return ACLMemberResponse(
        id=acl.id,
        user_id=acl.user_id,
        username=body.username,
        role=acl.role,
        granted_by=acl.granted_by,
        created_at=acl.created_at,
    )


@router.put("/{user_id}", response_model=ACLMemberResponse)
async def update_member_role(
    request: Request,
    user_id: str,
    body: ACLUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """修改成员角色（需要 owner 权限）"""
    await require_collection_role(
        request, min_role="owner", db=db, current_user=current_user
    )

    collection_id = request.path_params["collection_id"]
    old_role = await permission_service.get_role(user_id, collection_id, db)

    try:
        acl = await permission_service.update_role(
            collection_id=collection_id,
            user_id=user_id,
            new_role=body.role,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await permission_service.audit(
        user_id=current_user.id,
        action="acl.update",
        resource_type="collection",
        resource_id=collection_id,
        detail={"target_user_id": user_id, "old_role": old_role, "new_role": body.role},
        db=db,
    )
    await db.commit()

    return ACLMemberResponse(
        id=acl.id,
        user_id=acl.user_id,
        username="",  # 由调用方单独查
        role=acl.role,
        granted_by=acl.granted_by,
        created_at=acl.created_at,
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    request: Request,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """移除成员（需要 owner 权限；不能移除 owner）"""
    await require_collection_role(
        request, min_role="owner", db=db, current_user=current_user
    )

    collection_id = request.path_params["collection_id"]
    try:
        removed = await permission_service.revoke(collection_id, user_id, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="成员不存在")

    await permission_service.audit(
        user_id=current_user.id,
        action="acl.revoke",
        resource_type="collection",
        resource_id=collection_id,
        detail={"target_user_id": user_id},
        db=db,
    )
    await db.commit()


@router.post("/transfer", response_model=dict)
async def transfer_ownership(
    request: Request,
    body: ACLTransferRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """所有权转移（需要 owner 权限）"""
    await require_collection_role(
        request, min_role="owner", db=db, current_user=current_user
    )

    collection_id = request.path_params["collection_id"]
    new_owner_id = await _username_to_user_id(body.new_owner_username, db)

    try:
        await permission_service.transfer_ownership(
            collection_id=collection_id,
            current_owner_id=current_user.id,
            new_owner_id=new_owner_id,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await permission_service.audit(
        user_id=current_user.id,
        action="acl.transfer",
        resource_type="collection",
        resource_id=collection_id,
        detail={"old_owner": current_user.id, "new_owner": new_owner_id},
        db=db,
    )
    await db.commit()

    return {
        "old_owner_id": current_user.id,
        "new_owner_id": new_owner_id,
        "collection_id": collection_id,
    }
```

- [ ] **Step 3: 在 main.py 注册新路由**

修改 `backend/app/main.py`，在 `app.include_router(...)` 列表中追加：

```python
from app.api.acl import router as acl_router
# ...
app.include_router(acl_router)
```

- [ ] **Step 4: 验证 Python 语法 + 启动**

```bash
cd backend && .venv\Scripts\python.exe -c "from app.api.acl import router; print('OK')"
cd backend && .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

访问 `http://localhost:8000/docs` 应看到 `/api/v1/collections/{collection_id}/acl/*` 6 个端点。

- [ ] **Step 5: 提交**

```bash
git add backend/app/schemas/acl.py backend/app/api/acl.py backend/app/main.py
git commit -m "feat(acl): 实现 6 个 ACL 管理端点"
```

---

## Task 7: 改造 documents 端点（加权限检查）

**Files:**
- Modify: `backend/app/api/documents.py`

- [ ] **Step 1: 修改 upload_document 加 editor 检查**

修改 `backend/app/api/documents.py` 的 `upload_document`（约第 26 行），添加依赖：

```python
from app.auth.permissions import require_collection_role
from fastapi import Request

@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    request: Request,
    collection_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """上传文档到知识库（需要 editor+）"""
    await require_collection_role(
        request, min_role="editor", db=db, current_user=current_user
    )
    # ... 原有逻辑不变 ...
```

- [ ] **Step 2: 修改 list_documents 加 viewer 检查**

修改 `list_documents`（约第 113 行）：

```python
@router.get("", response_model=DocumentList)
async def list_documents(
    request: Request,
    collection_id: str = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """列出文档（需要 viewer+）"""
    if collection_id:
        await require_collection_role(
            request, min_role="viewer", db=db, current_user=current_user
        )
    # ... 原有逻辑不变（collection_id 为空时返回该用户可访问的全部）
    # 修改 document_service.list_documents 让其只返回可访问的 KB 下的文档
    documents, total = await document_service.list_documents(
        db=db, user=current_user, collection_id=collection_id, skip=skip, limit=limit
    )
```

- [ ] **Step 3: 修改 delete_document 加 editor 检查**

修改 `delete_document`（约第 147 行）：

```python
@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    request: Request,
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除文档（需要 editor+）"""
    # 先获取 document 以确定 collection_id
    from sqlalchemy import select
    from app.models.document import Document, Collection
    result = await db.execute(select(Document).where(Document.id == document_id))
    document = result.scalar_one_or_none()
    if document is None:
        raise HTTPException(status_code=404, detail="文档不存在")

    # 注入 collection_id 到 path_params 以便 require_collection_role 提取
    request.path_params["collection_id"] = document.collection_id
    await require_collection_role(
        request, min_role="editor", db=db, current_user=current_user
    )

    # ... 原删除逻辑 ...
    # 追加审计
    from app.services.permission_service import PermissionService
    await PermissionService().audit(
        user_id=current_user.id, action="doc.delete",
        resource_type="document", resource_id=document_id,
        detail={"collection_id": document.collection_id},
        db=db,
    )
```

- [ ] **Step 4: 修改 document_service.list_documents 支持 user 过滤**

修改 `backend/app/services/document_service.py` 的 `list_documents`（约第 143 行）：

```python
    async def list_documents(
        self,
        db: AsyncSession,
        user: Optional[User] = None,
        collection_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> tuple[list[Document], int]:
        """列出文档

        - 传 user：过滤为用户可访问 KB 下的文档
        - 传 collection_id：仅返回该 KB 的文档（外层应已做权限校验）
        """
        from app.models.acl import CollectionACL
        base_query = select(Document).join(
            CollectionACL,
            CollectionACL.collection_id == Document.collection_id,
        )
        if user and user.role != "admin":
            base_query = base_query.where(CollectionACL.user_id == user.id)
        if collection_id:
            base_query = base_query.where(Document.collection_id == collection_id)

        total = (await db.execute(
            select(func.count(Document.id)).select_from(base_query.subquery())
        )).scalar() or 0

        result = await db.execute(
            base_query.order_by(Document.created_at.desc()).offset(skip).limit(limit)
        )
        return list(result.scalars().all()), total
```

- [ ] **Step 5: 提交**

```bash
git add backend/app/api/documents.py backend/app/services/document_service.py
git commit -m "feat(acl): documents 端点加 editor/viewer 权限检查"
```

---

## Task 8: 改造 chat / search 端点

**Files:**
- Modify: `backend/app/api/chat.py`
- Modify: `backend/app/api/search.py`

- [ ] **Step 1: 修改 chat 加 viewer 检查**

修改 `backend/app/api/chat.py` 的 `chat`（约第 31 行）和 `chat_stream`（约第 67 行）：

```python
from app.auth.permissions import require_collection_role
from fastapi import Request

@router.post("", response_model=ChatResponse)
async def chat(
    request: Request,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """基于知识库进行问答（需要 viewer+）"""
    # 注入 collection_id 到 path_params
    request.path_params["collection_id"] = body.collection_id
    await require_collection_role(
        request, min_role="viewer", db=db, current_user=current_user
    )
    # ... 原逻辑不变 ...
```

同样修改 `chat_stream` 端点。

- [ ] **Step 2: 修改 search 加 viewer 检查**

修改 `backend/app/api/search.py`（端点约第 X 行 — 需先查看实际端点）：

```python
@router.post("", ...)  # 或 @router.get("")
async def search(
    request: Request,
    body: SearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """语义搜索（需要 viewer+）"""
    request.path_params["collection_id"] = body.collection_id
    await require_collection_role(
        request, min_role="viewer", db=db, current_user=current_user
    )
    # ... 原逻辑不变 ...
```

（先 Read `search.py` 确认实际端点签名再适配。）

- [ ] **Step 3: 提交**

```bash
git add backend/app/api/chat.py backend/app/api/search.py
git commit -m "feat(acl): chat/search 端点加 viewer 权限检查"
```

---

## Task 9: admin 审计日志端点

**Files:**
- Create: `backend/app/api/admin.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 创建 admin 路由**

创建 `backend/app/api/admin.py`：

```python
"""Admin-only API：审计日志查询"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.permissions import require_admin
from app.models.acl import AuditLog
from app.models.database import get_db
from app.models.document import User
from pydantic import BaseModel
import datetime
from typing import Optional

router = APIRouter(prefix="/api/v1/admin", tags=["管理员"])


class AuditLogItem(BaseModel):
    id: int
    user_id: Optional[str]
    username: Optional[str] = None
    action: str
    resource_type: str
    resource_id: str
    detail: Optional[dict] = None
    ip_address: Optional[str] = None
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class AuditLogList(BaseModel):
    items: list[AuditLogItem]
    total: int


@router.get("/audit-logs", response_model=AuditLogList)
async def list_audit_logs(
    user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    resource_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """查询审计日志（仅 admin）"""
    base = select(AuditLog)
    count_base = select(func.count(AuditLog.id))
    if user_id:
        base = base.where(AuditLog.user_id == user_id)
        count_base = count_base.where(AuditLog.user_id == user_id)
    if action:
        base = base.where(AuditLog.action == action)
        count_base = count_base.where(AuditLog.action == action)
    if resource_type:
        base = base.where(AuditLog.resource_type == resource_type)
        count_base = count_base.where(AuditLog.resource_type == resource_type)
    if resource_id:
        base = base.where(AuditLog.resource_id == resource_id)
        count_base = count_base.where(AuditLog.resource_id == resource_id)

    total = (await db.execute(count_base)).scalar() or 0
    result = await db.execute(
        base.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
    )
    logs = result.scalars().all()
    return AuditLogList(
        items=[AuditLogItem.model_validate(log) for log in logs],
        total=total,
    )
```

- [ ] **Step 2: 注册路由**

修改 `backend/app/main.py`：

```python
from app.api.admin import router as admin_router
app.include_router(admin_router)
```

- [ ] **Step 3: 验证 + 提交**

```bash
cd backend && .venv\Scripts\python.exe -c "from app.api.admin import router; print('OK')"
cd backend && .venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
# 访问 http://localhost:8000/docs 应看到 /api/v1/admin/audit-logs

git add backend/app/api/admin.py backend/app/main.py
git commit -m "feat(acl): 实现 admin 审计日志查询端点"
```

---

## Task 10: 前端类型与 API 客户端

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/permissions.ts`

- [ ] **Step 1: 添加类型定义**

修改 `frontend/src/types/index.ts`，追加：

```typescript
export type AclRole = "owner" | "editor" | "viewer";

export interface CollectionMember {
  id: string;
  user_id: string;
  username: string;
  display_name?: string;
  role: AclRole;
  granted_by?: string;
  created_at: string;
}

export interface CollectionMemberListResponse {
  items: CollectionMember[];
  total: number;
}

export interface InviteMemberRequest {
  username: string;
  role: "editor" | "viewer";
}

export interface UpdateMemberRoleRequest {
  role: AclRole;
}

export interface TransferOwnershipRequest {
  new_owner_username: string;
}

// 扩展 Collection 接口，添加当前用户角色（仅后端在 list 时附带）
export interface Collection {
  // ... 原有字段 ...
  my_role?: AclRole;  // 新增：当前用户对此 KB 的角色
}

// 审计日志
export interface AuditLog {
  id: number;
  user_id?: string;
  username?: string;
  action: string;
  resource_type: string;
  resource_id: string;
  detail?: Record<string, any>;
  ip_address?: string;
  created_at: string;
}
```

并在 `CollectionResponse` 同位置增加 `my_role?: AclRole`。

- [ ] **Step 2: 修改 api.ts 添加 ACL 方法**

修改 `frontend/src/lib/api.ts`，追加：

```typescript
import type {
  CollectionMember,
  CollectionMemberListResponse,
  InviteMemberRequest,
  UpdateMemberRoleRequest,
  TransferOwnershipRequest,
  AclRole,
  AuditLog,
} from "@/types";

// 在 ApiClient 类内部添加：
async listCollectionMembers(collectionId: string): Promise<CollectionMemberListResponse> {
  return this.request<CollectionMemberListResponse>(
    `/api/v1/collections/${collectionId}/acl`
  );
}

async inviteCollectionMember(
  collectionId: string,
  data: InviteMemberRequest
): Promise<CollectionMember> {
  return this.request<CollectionMember>(
    `/api/v1/collections/${collectionId}/acl`,
    { method: "POST", body: JSON.stringify(data) }
  );
}

async updateCollectionMemberRole(
  collectionId: string,
  userId: string,
  data: UpdateMemberRoleRequest
): Promise<CollectionMember> {
  return this.request<CollectionMember>(
    `/api/v1/collections/${collectionId}/acl/${userId}`,
    { method: "PUT", body: JSON.stringify(data) }
  );
}

async removeCollectionMember(
  collectionId: string,
  userId: string
): Promise<void> {
  await this.request<void>(
    `/api/v1/collections/${collectionId}/acl/${userId}`,
    { method: "DELETE" }
  );
}

async transferCollectionOwnership(
  collectionId: string,
  newOwnerUsername: string
): Promise<{ old_owner_id: string; new_owner_id: string }> {
  return this.request<{ old_owner_id: string; new_owner_id: string }>(
    `/api/v1/collections/${collectionId}/acl/transfer`,
    { method: "POST", body: JSON.stringify({ new_owner_username: newOwnerUsername }) }
  );
}

async listAuditLogs(params: {
  user_id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  skip?: number;
  limit?: number;
}): Promise<{ items: AuditLog[]; total: number }> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined) search.append(k, String(v));
  });
  return this.request(`/api/v1/admin/audit-logs?${search}`);
}
```

- [ ] **Step 3: 创建前端权限工具**

创建 `frontend/src/lib/permissions.ts`：

```typescript
import type { AclRole } from "@/types";

const ROLE_PRIORITY: Record<AclRole, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
};

/** 当前用户是否对该 KB 拥有指定级别或更高权限 */
export function hasRole(userRole: AclRole | undefined, minRole: AclRole): boolean {
  if (!userRole) return false;
  return ROLE_PRIORITY[userRole] >= ROLE_PRIORITY[minRole];
}

export function isAdmin(user: { role: string } | null | undefined): boolean {
  return user?.role === "admin";
}

export function isOwner(userRole: AclRole | undefined): boolean {
  return userRole === "owner";
}

export function isEditor(userRole: AclRole | undefined): boolean {
  return userRole === "editor" || userRole === "owner";
}

export function canWriteDocuments(userRole: AclRole | undefined): boolean {
  return hasRole(userRole, "editor");
}

export function canManageMembers(userRole: AclRole | undefined): boolean {
  return userRole === "owner";
}

export const ROLE_LABELS: Record<AclRole, string> = {
  owner: "所有者",
  editor: "编辑者",
  viewer: "访客",
};
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/types/index.ts frontend/src/lib/api.ts frontend/src/lib/permissions.ts
git commit -m "feat(acl): 前端类型与 API 客户端"
```

---

## Task 11: 前端 3 个新组件

**Files:**
- Create: `frontend/src/components/RoleBadge.tsx`
- Create: `frontend/src/components/InviteMemberDialog.tsx`
- Create: `frontend/src/components/CollectionMemberManager.tsx`

- [ ] **Step 1: RoleBadge 组件**

创建 `frontend/src/components/RoleBadge.tsx`：

```tsx
"use client";

import { Crown, Pencil, Eye } from "lucide-react";
import type { AclRole } from "@/types";

interface Props {
  role: AclRole;
  size?: "sm" | "md";
}

const config: Record<AclRole, {
  label: string;
  Icon: typeof Crown;
  className: string;
}> = {
  owner: {
    label: "Owner",
    Icon: Crown,
    className: "bg-violet-100 text-violet-700 border-violet-200",
  },
  editor: {
    label: "Editor",
    Icon: Pencil,
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  viewer: {
    label: "Viewer",
    Icon: Eye,
    className: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

export default function RoleBadge({ role, size = "md" }: Props) {
  const { label, Icon, className } = config[role];
  const sizing =
    size === "sm" ? "text-[10px] px-1.5 py-0.5 gap-1" : "text-xs px-2 py-0.5 gap-1";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${sizing} ${className}`}
    >
      <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {label}
    </span>
  );
}
```

- [ ] **Step 2: InviteMemberDialog 组件**

创建 `frontend/src/components/InviteMemberDialog.tsx`：

```tsx
"use client";

import { useState } from "react";
import { X, UserPlus } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  collectionId: string;
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}

export default function InviteMemberDialog({
  collectionId,
  open,
  onClose,
  onInvited,
}: Props) {
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("viewer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleSubmit() {
    if (!username.trim()) return;
    setLoading(true);
    setError("");
    try {
      await api.inviteCollectionMember(collectionId, { username, role });
      setUsername("");
      onInvited();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "邀请失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">邀请成员</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="输入要邀请的用户名"
              autoFocus
              className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">角色</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
              className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none"
            >
              <option value="viewer">访客（只读）</option>
              <option value="editor">编辑者（可上传/删除文档）</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={loading || !username.trim()}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              {loading ? "邀请中..." : "邀请"}
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: CollectionMemberManager 组件**

创建 `frontend/src/components/CollectionMemberManager.tsx`：

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { UserPlus, MoreVertical, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import RoleBadge from "./RoleBadge";
import InviteMemberDialog from "./InviteMemberDialog";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { canManageMembers, isOwner, isAdmin } from "@/lib/permissions";
import type { CollectionMember, AclRole } from "@/types";

interface Props {
  collectionId: string;
  myRole?: AclRole;
}

export default function CollectionMemberManager({ collectionId, myRole }: Props) {
  const { user } = useAuth();
  const [members, setMembers] = useState<CollectionMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);

  const canManage = isAdmin(user) || canManageMembers(myRole);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.listCollectionMembers(collectionId);
      setMembers(result.items);
    } catch (err) {
      console.error("Failed to load members:", err);
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  if (!canManage) return null;

  async function handleRoleChange(member: CollectionMember, newRole: AclRole) {
    try {
      await api.updateCollectionMemberRole(collectionId, member.user_id, { role: newRole });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "修改失败");
    }
    setMenuOpenFor(null);
  }

  async function handleRemove(member: CollectionMember) {
    if (!confirm(`确定移除 ${member.username} 吗？`)) return;
    try {
      await api.removeCollectionMember(collectionId, member.user_id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "移除失败");
    }
    setMenuOpenFor(null);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">成员管理</h2>
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <UserPlus className="h-4 w-4" />
          邀请成员
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500">加载中...</div>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-semibold text-white">
                {member.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {member.display_name || member.username}
                </p>
                <p className="text-xs text-slate-500">@{member.username}</p>
              </div>
              <RoleBadge role={member.role} size="sm" />
              {member.role !== "owner" && (
                <div className="relative">
                  <button
                    onClick={() => setMenuOpenFor(menuOpenFor === member.user_id ? null : member.user_id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {menuOpenFor === member.user_id && (
                    <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-slate-200 bg-white shadow-lg z-10 py-1">
                      {member.role === "viewer" && (
                        <button
                          onClick={() => handleRoleChange(member, "editor")}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                          升级为编辑者
                        </button>
                      )}
                      {member.role === "editor" && (
                        <button
                          onClick={() => handleRoleChange(member, "viewer")}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                          降级为访客
                        </button>
                      )}
                      <button
                        onClick={() => handleRemove(member)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        移除
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <InviteMemberDialog
        collectionId={collectionId}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={load}
      />
    </div>
  );
}
```

- [ ] **Step 4: 构建验证**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

预期：编译通过，3 个新组件无 TypeScript 错误。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/RoleBadge.tsx frontend/src/components/InviteMemberDialog.tsx frontend/src/components/CollectionMemberManager.tsx
git commit -m "feat(acl): 前端 RoleBadge + InviteDialog + MemberManager 组件"
```

---

## Task 12: 前端集成（CollectionCard 徽章 + 详情页 Tab）

**Files:**
- Modify: `frontend/src/components/CollectionCard.tsx`
- Modify: `frontend/src/app/collections/[id]/page.tsx`
- Modify: `frontend/src/components/DocumentList.tsx`（禁用上传按钮）

- [ ] **Step 1: CollectionCard 添加徽章**

修改 `frontend/src/components/CollectionCard.tsx`：

```tsx
// 在 import 部分添加
import RoleBadge from "./RoleBadge";
import type { AclRole } from "@/types";

// Props 添加
interface Props {
  collection: Collection;
}

// 修改组件：
export default function CollectionCard({ collection }: Props) {
  const gradient = getGradient(collection.id);
  const myRole = collection.my_role;

  return (
    <Link
      href={`/collections/${collection.id}`}
      className="group block rounded-2xl border border-slate-200 bg-white shadow-sm card-hover overflow-hidden"
    >
      <div className={`h-1.5 bg-gradient-to-r ${gradient}`} />

      <div className="p-5">
        <div className="flex items-start justify-between mb-3 gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-900 truncate group-hover:text-blue-700 transition-colors">
              {collection.name}
            </h3>
            {collection.description && (
              <p className="mt-1 text-sm text-slate-500 line-clamp-2 leading-relaxed">
                {collection.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {myRole && <RoleBadge role={myRole} size="sm" />}
            <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>
        {/* ... 其余不变 ... */}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: 修改 dashboard 加载时附 my_role**

修改 `frontend/src/app/dashboard/page.tsx` 的 `loadCollections`，从返回的 items 中提取 `my_role`（如果后端附带）— 这要求后端 `CollectionResponse` 加 `my_role` 字段。

如果暂未实现，可省略；徽章处 `my_role` 可选。

- [ ] **Step 3: 详情页加 Tab**

修改 `frontend/src/app/collections/[id]/page.tsx`：

```tsx
// 顶部 import
import { useState } from "react";
import CollectionMemberManager from "@/components/CollectionMemberManager";

// 在组件内
const [tab, setTab] = useState<"overview" | "members">("overview");

// 在 collection 信息卡片下方：
{collection && (
  <>
    <div className="mb-6 border-b border-slate-200">
      <nav className="flex gap-6">
        <button
          onClick={() => setTab("overview")}
          className={`relative pb-3 text-sm font-medium transition-colors ${
            tab === "overview" ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          概览
          {tab === "overview" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
        <button
          onClick={() => setTab("members")}
          className={`relative pb-3 text-sm font-medium transition-colors ${
            tab === "members" ? "text-blue-600" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          成员
          {tab === "members" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
      </nav>
    </div>

    {tab === "overview" && <DocumentList collectionId={id} />}
    {tab === "members" && (
      <CollectionMemberManager
        collectionId={id}
        myRole={collection.my_role}
      />
    )}
  </>
)}
```

- [ ] **Step 4: DocumentList 接收禁用 prop**

修改 `frontend/src/components/DocumentList.tsx` 接收 `disabled?: boolean` prop，在上传按钮处：

```tsx
<button
  disabled={disabled}
  className="... disabled:opacity-50 disabled:cursor-not-allowed"
  title={disabled ? "无写入权限" : undefined}
>
  上传文档
</button>
```

并在父组件传入 `{disabled: !canWriteDocuments(myRole)}`。

- [ ] **Step 5: 构建验证**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

预期：编译通过。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/CollectionCard.tsx frontend/src/app/collections/[id]/page.tsx frontend/src/components/DocumentList.tsx frontend/src/app/dashboard/page.tsx
git commit -m "feat(acl): 前端集成 — 徽章 + Tab + 权限禁用"
```

---

## Task 13: 端到端测试（手动 + 集成）

**Files:**
- Create: `backend/tests/test_e2e_permissions.py`

- [ ] **Step 1: 编写端到端测试**

创建 `backend/tests/test_e2e_permissions.py`：

```python
"""端到端测试：跨用户权限流程"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.models.document import Collection, User
from app.services.permission_service import PermissionService


@pytest.mark.asyncio
async def test_user_cannot_see_others_collection(
    client: AsyncClient,
    db: AsyncSession,
    alice: User,  # fixture: 创建 alice
    bob: User,    # fixture: 创建 bob
):
    """alice 创建的 KB，bob 看不到"""
    # alice 创建 KB
    alice_token = await login(client, "alice", "password")
    create_resp = await client.post(
        "/api/v1/collections",
        json={"name": "alice-kb"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    coll_id = create_resp.json()["id"]

    # bob 登录
    bob_token = await login(client, "bob", "password")
    list_resp = await client.get(
        "/api/v1/collections",
        headers={"Authorization": f"Bearer {bob_token}"},
    )
    items = list_resp.json()["items"]
    assert all(item["id"] != coll_id for item in items)


@pytest.mark.asyncio
async def test_invite_then_access(
    client: AsyncClient, alice_token: str, bob: User, alice_kb: str
):
    """alice 邀请 bob 为 editor 后，bob 可上传"""
    await client.post(
        f"/api/v1/collections/{alice_kb}/acl",
        json={"username": "bob", "role": "editor"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )

    bob_token = await login(client, "bob", "password")
    # bob 列出 KB 应能看见
    list_resp = await client.get(
        "/api/v1/collections",
        headers={"Authorization": f"Bearer {bob_token}"},
    )
    items = list_resp.json()["items"]
    assert any(item["id"] == alice_kb for item in items)


@pytest.mark.asyncio
async def test_viewer_cannot_upload(
    client: AsyncClient, alice_token: str, bob: User, alice_kb: str
):
    """alice 邀请 bob 为 viewer，bob 不能上传"""
    await client.post(
        f"/api/v1/collections/{alice_kb}/acl",
        json={"username": "bob", "role": "viewer"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )

    bob_token = await login(client, "bob", "password")
    resp = await client.post(
        "/api/v1/documents/upload",
        data={"collection_id": alice_kb},
        files={"file": ("test.txt", b"content", "text/plain")},
        headers={"Authorization": f"Bearer {bob_token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_non_admin_cannot_view_audit_logs(
    client: AsyncClient, alice_token: str
):
    """非 admin 不能查询审计日志"""
    resp = await client.get(
        "/api/v1/admin/audit-logs",
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_view_audit_logs(
    client: AsyncClient, admin_token: str
):
    """admin 可查询"""
    resp = await client.get(
        "/api/v1/admin/audit-logs",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
```

- [ ] **Step 2: 创建测试 fixtures**

创建 `backend/tests/conftest.py`（如不存在）：

```python
import pytest
import asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.main import app
from app.models.database import get_db
from app.models.document import Base, User
from app.auth import hash_password

TEST_DB_URL = "sqlite+aiosqlite:///./test.db"  # 测试用 SQLite


@pytest.fixture
async def db():
    engine = create_async_engine(TEST_DB_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        yield session
    await engine.dispose()


@pytest.fixture
async def client(db):
    async def override_get_db():
        yield db
    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(app=app, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
async def alice(db):
    user = User(
        username="alice",
        hashed_password=hash_password("password"),
        display_name="Alice",
        role="user",
    )
    db.add(user)
    await db.flush()
    return user


@pytest.fixture
async def bob(db):
    user = User(
        username="bob",
        hashed_password=hash_password("password"),
        display_name="Bob",
        role="user",
    )
    db.add(user)
    await db.flush()
    return user


async def login(client, username, password):
    resp = await client.post("/api/v1/auth/login", json={
        "username": username, "password": password
    })
    return resp.json()["access_token"]


@pytest.fixture
async def alice_token(client, alice):
    return await login(client, "alice", "password")


@pytest.fixture
async def admin_token(client, db):
    admin = User(username="admin", hashed_password=hash_password("admin"), role="admin")
    db.add(admin)
    await db.flush()
    return await login(client, "admin", "admin")
```

- [ ] **Step 3: 浏览器手动验证**

启动后端 + 前端，按以下流程测试：

1. **登录 alice** → 创建 KB "alice-kb" → 可见于 dashboard，徽章显示 Owner
2. **登录 bob**（新用户）→ dashboard 应为空
3. **切回 alice** → 进 alice-kb 详情 → "成员"Tab → 邀请 bob 为 viewer
4. **登录 bob** → 看到 alice-kb，徽章 Viewer → 进详情 → 上传按钮**禁用**
5. **alice 升级 bob 为 editor** → bob 上传按钮**启用**
6. **bob 删除自己创建的文档** → 成功
7. **bob 尝试查看 /api/v1/admin/audit-logs** → 403
8. **登录 admin** → 看到所有 KB（包括 alice-kb） → 可查审计日志

每一步记录截图到 `docs/superpowers/screenshots/`。

- [ ] **Step 4: 提交**

```bash
git add backend/tests/test_e2e_permissions.py backend/tests/conftest.py
git commit -m "test(acl): 端到端权限流程测试"
```

---

## 完成标志

✅ 13 个任务全部完成时，应满足 [设计文档 §13 成功标准](../../specs/2026-07-14-fine-grained-permission-control-design.md#13-成功标准)：

- ✅ 普通用户无法看到自己无权访问的 KB
- ✅ 普通用户操作他人 KB 返回 403
- ✅ Admin 可访问所有 KB 和审计日志
- ✅ 现有数据无丢失
- ✅ 所有权限变更产生审计记录
- ✅ 端到端流程测试通过

最终构建验证：

```bash
cd backend && .venv\Scripts\python.exe -m pytest tests/ -v
cd frontend && npm run build
```

预期：所有测试通过，前端构建成功。

---

**预计工作量**：13 个任务，每任务 30-60 分钟，总计 1-2 个完整工作日。