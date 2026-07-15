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
            from sqlalchemy import func as sa_func

            total = (await db.execute(select(sa_func.count(Collection.id)))).scalar() or 0
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
        user_id: Optional[str],
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