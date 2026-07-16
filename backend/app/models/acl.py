"""细粒度权限控制模型"""

from __future__ import annotations

import datetime
import uuid
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
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


class OAuthAccount(Base):
    """第三方 OAuth 账号绑定表。同一本地用户可绑定多个 Provider。"""

    __tablename__ = "oauth_accounts"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # microsoft | github
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    # Provider 侧的稳定用户 ID（oid / id）
    provider_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    # Provider 返回的邮箱，可空（用户可能未公开）。仅作参考，不作为身份。
    provider_email: Mapped[Optional[str]] = mapped_column(String(255))
    provider_display_name: Mapped[Optional[str]] = mapped_column(String(255))
    avatar_url: Mapped[Optional[str]] = mapped_column(Text)
    # 是否为该用户的首选 Provider（未来扩展预留）。同一 Provider 一个用户只应有一条绑定。
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "provider", "provider_user_id", name="uq_oauth_provider_user"
        ),
        Index("idx_oauth_user", "user_id"),
    )

    def __repr__(self) -> str:
        return (
            f"<OAuthAccount(user_id={self.user_id}, provider={self.provider}, "
            f"provider_user_id={self.provider_user_id})>"
        )