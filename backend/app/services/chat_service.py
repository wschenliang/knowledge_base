"""问答服务"""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator, Optional

from sqlalchemy import select, func, delete as sa_delete
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
        filters: Optional[dict] = None,
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

        # 构造 filter_condition
        filter_condition = self._build_filter_condition(collection_id, filters, db)

        # 执行 RAG
        result = await self.rag_engine.query(
            query=query,
            collection_name=collection.qdrant_collection,
            chat_history=chat_history,
            top_k=top_k,
            filter_condition=filter_condition,
            use_reranker=use_reranker,
        )

        # 把 highlight_terms 注入每条 source
        engine_search = await self.rag_engine.search(
            query=query,
            collection_name=collection.qdrant_collection,
            top_k=top_k,
            filter_condition=filter_condition,
            use_reranker=use_reranker,
        )
        highlight_terms = engine_search["highlight_terms"]
        sources_with_terms = []
        for s in result.get("sources", []):
            new_s = dict(s)
            new_s["highlight_terms"] = highlight_terms
            sources_with_terms.append(new_s)

        # 保存助手回复
        if db:
            await self._save_message(
                conversation.id,
                "assistant",
                result["answer"],
                sources=sources_with_terms,
                db=db,
            )

            # 更新对话信息
            conversation.message_count += 2  # user + assistant
            if conversation.title == "新对话":
                conversation.title = query[:100]

        return {
            "answer": result["answer"],
            "sources": sources_with_terms,
            "conversation_id": conversation.id,
        }

    async def chat_stream(
        self,
        query: str,
        collection_id: str,
        conversation_id: Optional[str] = None,
        user_id: Optional[str] = None,
        top_k: int = 5,
        use_reranker: bool = True,
        filters: Optional[dict] = None,
        db: Optional[AsyncSession] = None,
    ) -> AsyncGenerator[str, None]:
        """流式问答 — 产出 SSE 格式的字符串

        SSE 事件格式:
            data: {"type": "sources", "sources": [...含 highlight_terms...]}
            data: {"type": "token", "content": "..."}
            data: {"type": "done", "answer": "...", "sources": [...], "conversation_id": "..."}
            data: {"type": "error", "content": "..."}

        注意：StreamingResponse 下依赖的 commit() 在客户端断开/CancelledError 时不会执行，
        因此必须在 yield 之前显式提交，确保对话和用户消息落库。
        """
        if not db:
            raise ValueError("需要数据库会话才能持久化对话")

        # ========== 阶段 1：创建对话、保存用户消息、立即提交 ==========
        # 在任何 yield 之前 commit，确保即使客户端断开/点击停止，对话也已落库
        collection = await self._get_collection(collection_id, db)
        conversation = await self._get_or_create_conversation(
            conversation_id, collection_id, user_id, db
        )

        # 获取对话历史
        chat_history = await self._get_chat_history(conversation.id, db)

        # 保存用户消息
        await self._save_message(conversation.id, "user", query, db=db)

        # ★ 关键修复：在 yield 前显式 commit，让会话立即可见
        await db.commit()

        # ========== 阶段 2：执行检索（构造 filter_condition + 提取 highlight_terms） ==========
        filter_condition = self._build_filter_condition(collection_id, filters, db)
        engine_search = await self.rag_engine.search(
            query=query,
            collection_name=collection.qdrant_collection,
            top_k=top_k,
            filter_condition=filter_condition,
            use_reranker=use_reranker,
        )
        retrieved_docs = engine_search["results"]
        highlight_terms = engine_search["highlight_terms"]

        # ========== 阶段 3：流式合成 ==========
        full_answer = ""
        sources: list[dict] = []
        try:
            async for event in self.rag_engine.synthesizer.synthesize_stream(
                query=query,
                retrieved_docs=retrieved_docs,
                chat_history=chat_history,
            ):
                event_type = event["type"]

                if event_type == "sources":
                    sources = event.get("sources", [])
                    # 给每条 source 注入 highlight_terms
                    sources_with_terms = [
                        {**s, "highlight_terms": highlight_terms} for s in sources
                    ]
                    yield self._sse_event({"type": "sources", "sources": sources_with_terms})

                elif event_type == "token":
                    yield self._sse_event(
                        {"type": "token", "content": event["content"]}
                    )

                elif event_type == "error":
                    yield self._sse_event(
                        {"type": "error", "content": event["content"]}
                    )
                    return

                elif event_type == "done":
                    full_answer = event.get("answer", "")
                    sources = event.get("sources", sources)
        except Exception as e:
            logger.exception(f"流式生成失败: {e}")
            yield self._sse_event(
                {"type": "error", "content": f"生成失败: {str(e)}"}
            )
            return

        # 把最终 sources 也加上 highlight_terms 后再持久化 + done 事件
        sources_with_terms = [
            {**s, "highlight_terms": highlight_terms} for s in sources
        ]

        # ========== 阶段 4：保存助手回复、更新对话元数据、提交 ==========
        try:
            await self._save_message(
                conversation.id,
                "assistant",
                full_answer,
                sources=sources_with_terms,
                db=db,
            )
            # commit 后 conversation 已 detached，需重新 add 才能更新属性
            db.add(conversation)
            conversation.message_count += 2
            if conversation.title == "新对话":
                conversation.title = query[:100]
            await db.commit()
        except Exception as e:
            logger.exception(f"保存助手消息失败: {e}")
            try:
                await db.rollback()
            except Exception:
                pass

        yield self._sse_event(
            {
                "type": "done",
                "answer": full_answer,
                "sources": sources_with_terms,
                "conversation_id": conversation.id,
            }
        )

    @staticmethod
    def _sse_event(data: dict) -> str:
        """将字典序列化为 SSE data 行"""
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

    async def get_search_facets(
        self,
        collection_id: str,
        db: AsyncSession,
    ) -> dict:
        """获取当前 KB 的可选筛选维度（uploaders / tags / file_types）。"""
        from sqlalchemy import func, select
        from app.models.document import Document, User, Tag, CollectionTag

        # ===== Uploaders =====
        # 当前 KB 中所有非空上传者，按文档数倒序
        uploader_rows = await db.execute(
            select(
                User.id,
                User.username,
                func.count(Document.id).label("cnt"),
            )
            .join(Document, Document.uploader_id == User.id)
            .where(Document.collection_id == collection_id)
            .group_by(User.id, User.username)
            .order_by(func.count(Document.id).desc())
        )
        uploaders = [
            {"value": uid, "label": uname, "count": cnt}
            for uid, uname, cnt in uploader_rows.all()
        ]

        # ===== Tags =====
        tag_rows = await db.execute(
            select(Tag.id, Tag.name, func.count(CollectionTag.collection_id).label("cnt"))
            .join(CollectionTag, CollectionTag.tag_id == Tag.id)
            .where(CollectionTag.collection_id == collection_id)
            .group_by(Tag.id, Tag.name)
            .order_by(func.count(CollectionTag.collection_id).desc(), Tag.name)
        )
        tags = [
            {"value": tid, "label": tname, "count": cnt}
            for tid, tname, cnt in tag_rows.all()
        ]

        # ===== File Types =====
        ft_rows = await db.execute(
            select(Document.file_type, func.count(Document.id).label("cnt"))
            .where(Document.collection_id == collection_id)
            .group_by(Document.file_type)
            .order_by(func.count(Document.id).desc())
        )
        type_label_map = {
            "pdf": "PDF",
            "docx": "Word",
            "doc": "Word",
            "md": "Markdown",
            "txt": "Text",
            "xlsx": "Excel",
            "xls": "Excel",
            "pptx": "PowerPoint",
            "ppt": "PowerPoint",
            "html": "HTML",
            "csv": "CSV",
        }
        file_types = [
            {"value": ft, "label": type_label_map.get(ft, ft.upper()), "count": cnt}
            for ft, cnt in ft_rows.all()
        ]

        return {"uploaders": uploaders, "tags": tags, "file_types": file_types}

    async def search(
        self,
        query: str,
        collection_id: str,
        top_k: int = 10,
        use_reranker: bool = True,
        filters: Optional[dict] = None,
        db: Optional[AsyncSession] = None,
    ) -> dict:
        """语义搜索"""
        collection = await self._get_collection(collection_id, db)

        # filters → Qdrant filter_condition
        filter_condition = self._build_filter_condition(collection_id, filters, db)

        engine_result = await self.rag_engine.search(
            query=query,
            collection_name=collection.qdrant_collection,
            top_k=top_k,
            filter_condition=filter_condition,
            use_reranker=use_reranker,
        )
        results = engine_result["results"]
        highlight_terms = engine_result["highlight_terms"]

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
                    "file_type": r.get("metadata", {}).get("file_type"),
                    "uploader_username": r.get("metadata", {}).get("uploader_username"),
                    "document_id": r.get("metadata", {}).get("document_id"),
                    "tag_ids": r.get("metadata", {}).get("tag_ids", []) or [],
                    "highlight_terms": highlight_terms,
                }
                for i, r in enumerate(results)
            ],
            "total": len(results),
            "applied_filters": filters,
        }

    @staticmethod
    def _build_filter_condition(
        collection_id: str,
        filters: Optional[dict],
        db: Optional[AsyncSession],
    ) -> Optional[dict]:
        """将前端 filters 转为 Qdrant filter_condition dict。

        说明：
        - file_types → file_type 字段 IN 列表
        - uploader_ids → uploader_id 字段 IN 列表
        - tag_ids → tag_ids 数组 contains 任意一个（用 FieldCondition.any）
        - filename_contains → filename match text
        """
        if not filters:
            return None
        # 简化：把 dict 转成 Qdrant Filter（FieldCondition）；tag_ids 用 PayloadField("tag_ids") 的 any
        # 此处直接构造 dict，retriever._vector_search 会 models.Filter(**dict) 解析
        from qdrant_client.http import models
        from sqlalchemy import select
        from app.models.document import Document, CollectionTag

        must = []

        if filters.get("file_types"):
            must.append(
                models.FieldCondition(
                    key="file_type",
                    match=models.MatchAny(any=filters["file_types"]),
                )
            )

        if filters.get("uploader_ids"):
            must.append(
                models.FieldCondition(
                    key="uploader_id",
                    match=models.MatchAny(any=filters["uploader_ids"]),
                )
            )

        if filters.get("tag_ids"):
            must.append(
                models.FieldCondition(
                    key="tag_ids",
                    match=models.MatchAny(any=filters["tag_ids"]),
                )
            )

        if filters.get("filename_contains"):
            must.append(
                models.FieldCondition(
                    key="filename",
                    match=models.MatchText(text=filters["filename_contains"]),
                )
            )

        if not must:
            return None

        return {"must": [c.model_dump() for c in must]}

    # ===== 对话历史 CRUD =====

    async def list_conversations(
        self,
        user_id: str,
        collection_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
        db: Optional[AsyncSession] = None,
    ) -> tuple[list[Conversation], int]:
        """获取用户的对话列表"""
        query = select(Conversation).where(Conversation.user_id == user_id)
        count_query = select(func.count()).select_from(Conversation).where(
            Conversation.user_id == user_id
        )

        if collection_id:
            query = query.where(Conversation.collection_id == collection_id)
            count_query = count_query.where(
                Conversation.collection_id == collection_id
            )

        query = query.order_by(Conversation.updated_at.desc()).offset(skip).limit(limit)

        result = await db.execute(query)
        conversations = list(result.scalars().all())

        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0

        return conversations, total

    async def get_conversation(
        self,
        conversation_id: str,
        user_id: str,
        db: Optional[AsyncSession] = None,
    ) -> Optional[Conversation]:
        """获取单个对话（验证归属）"""
        result = await db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_conversation_messages(
        self,
        conversation_id: str,
        db: Optional[AsyncSession] = None,
    ) -> list[Message]:
        """获取对话的消息列表"""
        result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.asc())
        )
        return list(result.scalars().all())

    async def delete_conversation(
        self,
        conversation_id: str,
        user_id: str,
        db: Optional[AsyncSession] = None,
    ) -> bool:
        """删除对话及其消息"""
        conv = await self.get_conversation(conversation_id, user_id, db)
        if not conv:
            return False
        await db.delete(conv)
        return True

    async def rename_conversation(
        self,
        conversation_id: str,
        user_id: str,
        title: str,
        db: Optional[AsyncSession] = None,
    ) -> Optional[Conversation]:
        """重命名对话"""
        conv = await self.get_conversation(conversation_id, user_id, db)
        if not conv:
            return None
        conv.title = title
        return conv
