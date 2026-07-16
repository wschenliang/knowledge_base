"""SQLAlchemy ORM 基础模型"""

from __future__ import annotations

import datetime
import uuid
from typing import Optional

from sqlalchemy import DateTime, String, Text, Boolean, Integer, ForeignKey, Enum as SAEnum, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func


# 默认标签颜色调色板
DEFAULT_TAG_COLORS = [
    "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
    "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
]


class Base(DeclarativeBase):
    pass


class Document(Base):
    """文档模型"""

    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    collection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("collections.id", ondelete="CASCADE"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[Optional[str]] = mapped_column(String(500))
    description: Mapped[Optional[str]] = mapped_column(Text)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending, processing, indexed, failed
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    metadata_: Mapped[Optional[str]] = mapped_column("metadata", Text)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # 关系
    collection: Mapped["Collection"] = relationship(back_populates="documents")

    def __repr__(self) -> str:
        return f"<Document(id={self.id}, filename={self.filename})>"


class Collection(Base):
    """知识库集合模型"""

    __tablename__ = "collections"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    qdrant_collection: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True
    )
    # is_public 字段已废弃：v2 权限模型改用 collection_acls 表达公开性。
    # DB 列保留（含 NOT NULL 约束），ORM 仍写入默认值 false 以满足约束。
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    owner_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL")
    )
    embedding_model: Mapped[str] = mapped_column(String(100), default="bge-m3")
    chunk_size: Mapped[int] = mapped_column(Integer, default=512)
    chunk_overlap: Mapped[int] = mapped_column(Integer, default=128)
    document_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # 关系
    documents: Mapped[list["Document"]] = relationship(
        back_populates="collection", cascade="all, delete-orphan"
    )
    owner: Mapped[Optional["User"]] = relationship(back_populates="collections")
    tags: Mapped[list["Tag"]] = relationship(
        secondary="collection_tags", back_populates="collections", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Collection(id={self.id}, name={self.name})>"


class Tag(Base):
    """全局标签模型"""

    __tablename__ = "tags"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    color: Mapped[Optional[str]] = mapped_column(String(7))  # hex color e.g. #3B82F6
    created_by: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # 关系
    collections: Mapped[list["Collection"]] = relationship(
        secondary="collection_tags", back_populates="tags"
    )

    def __repr__(self) -> str:
        return f"<Tag(id={self.id}, name={self.name})>"


class CollectionTag(Base):
    """知识库-标签关联表（多对多）"""

    __tablename__ = "collection_tags"

    collection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("collections.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )


class User(Base):
    """用户模型"""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    username: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="user")  # user, admin
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_login_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # 该用户是否设过本地密码。OAuth 首次登入创建的账号为 False，可后续在个人设置中补设。
    password_set: Mapped[bool] = mapped_column(Boolean, default=True)

    # 关系
    collections: Mapped[list["Collection"]] = relationship(back_populates="owner")

    def __repr__(self) -> str:
        return f"<User(id={self.id}, username={self.username})>"


class Conversation(Base):
    """对话历史模型"""

    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL")
    )
    collection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("collections.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(500), default="新对话")
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:
        return f"<Conversation(id={self.id}, title={self.title})>"


class Favorite(Base):
    """用户收藏的消息"""

    __tablename__ = "favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "message_id", name="uq_favorite_user_message"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    message_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("messages.id", ondelete="CASCADE"), nullable=False
    )
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    collection_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("collections.id", ondelete="CASCADE"), nullable=False
    )
    note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<Favorite(id={self.id}, message_id={self.message_id})>"


class Message(Base):
    """消息模型"""

    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user, assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    sources: Mapped[Optional[str]] = mapped_column(Text)  # JSON 格式的引用来源
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<Message(id={self.id}, role={self.role})>"
