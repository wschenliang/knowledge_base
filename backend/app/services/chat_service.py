"""问答服务"""

from __future__ import annotations

import json
import logging
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.document import Collection, Conversation, Message
from app.rag.engine import RAGEngine

logger = logging.getLogger(__name__)

# 全局 RAG 引擎实例
_rag_engine: Optional[RAGEngine] = None


def get_rag_engine() -> RAGEngine:
    """获取 RAG 引擎单例"""
    global _rag_engine
    if _rag_engine is None:
        _rag_engine = RAGEngine()
    return _rag_engine


class ChatService:
    """问答对话服务"""

    def __init__(self):
        self.rag_engine = get_rag_engine()

    async def _get_collection(
        self, collection_id: str, db: AsyncSession
    ) -> Collection:
        """获取知识库集合"""
        result = await db.execute(
            select(Collection).where(Collection.id == collection_id)
        )
        collection = result.scalar_one_or_none()
        if collection is None:
            raise ValueError(f"知识库集合不存在: {collection_id}")
        return collection

    async def _get_or_create_conversation(
        self,
        conversation_id: Optional[str],
        collection_id: str,
        user_id: Optional[str],
        db: AsyncSession,
    ) -> Conversation:
        """获取或创建对话"""
        if conversation_id:
            result = await db.execute(
                select(Conversation).where(Conversation.id == conversation_id)
            )
            conversation = result.scalar_one_or_none()
            if conversation:
                return conversation

        conversation = Conversation(
            collection_id=collection_id,
            user_id=user_id,
        )
        db.add(conversation)
        await db.flush()
        await db.refresh(conversation)
        return conversation

    async def _get_chat_history(
        self, conversation_id: str, db: AsyncSession
    ) -> list[dict]:
        """获取对话历史"""
        result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.asc())
            .limit(20)
        )
        messages = result.scalars().all()
        return [
            {"role": msg.role, "content": msg.content} for msg in messages
        ]

    async def _save_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        sources: Optional[list[dict]] = None,
        db: Optional[AsyncSession] = None,
    ):
        """保存消息"""
        message = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            sources=json.dumps(sources, ensure_ascii=False) if sources else None,
        )
        if db:
            db.add(message)
            await db.flush()

    async def chat(
        self,
        query: str,
        collection_id: str,
        conversation_id: Optional[str] = None,
        user_id: Optional[str] = None,
        top_k: int = 5,
        use_reranker: bool = True,
        db: Optional[AsyncSession] = None,
    ) -> dict:
        """执行问答

        Returns:
            包含 answer, sources, conversation_id 的字典
        """
        # 获取知识库
        collection = await self._get_collection(collection_id, db)

        # 获取或创建对话
        conversation = await self._get_or_create_conversation(
            conversation_id, collection_id, user_id, db
        )

        # 获取对话历史
        chat_history = []
        if db:
            chat_history = await self._get_chat_history(conversation.id, db)

        # 保存用户消息
        if db:
            await self._save_message(conversation.id, "user", query, db=db)

        # 执行 RAG
        result = await self.rag_engine.query(
            query=query,
            collection_name=collection.qdrant_collection,
            chat_history=chat_history,
            top_k=top_k,
            use_reranker=use_reranker,
        )

        # 保存助手回复
        if db:
            await self._save_message(
                conversation.id,
                "assistant",
                result["answer"],
                sources=result.get("sources"),
                db=db,
            )

            # 更新对话信息
            conversation.message_count += 2  # user + assistant
            if conversation.title == "新对话":
                conversation.title = query[:100]

        return {
            "answer": result["answer"],
            "sources": result.get("sources", []),
            "conversation_id": conversation.id,
        }

    async def search(
        self,
        query: str,
        collection_id: str,
        top_k: int = 10,
        use_reranker: bool = True,
        db: Optional[AsyncSession] = None,
    ) -> dict:
        """语义搜索"""
        collection = await self._get_collection(collection_id, db)

        results = await self.rag_engine.search(
            query=query,
            collection_name=collection.qdrant_collection,
            top_k=top_k,
            use_reranker=use_reranker,
        )

        return {
            "query": query,
            "results": [
                {
                    "index": i,
                    "source": r.get("metadata", {}).get(
                        "filename", "unknown"
                    ),
                    "text": r.get("text", ""),
                    "score": r.get("score", r.get("rerank_score", 0)),
                }
                for i, r in enumerate(results)
            ],
            "total": len(results),
        }
