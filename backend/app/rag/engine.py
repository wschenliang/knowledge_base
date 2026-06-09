"""RAG 引擎 - 核心编排模块"""

from __future__ import annotations

import json
import logging
import os
from typing import Optional

from qdrant_client import QdrantClient
from qdrant_client.http import models

from app.config import settings
from app.rag.chunker import TextChunker
from app.rag.embedder import EmbeddingProvider
from app.rag.reader import DocumentReader
from app.rag.retriever import HybridRetriever
from app.rag.reranker import Reranker
from app.rag.synthesizer import Synthesizer

logger = logging.getLogger(__name__)


class RAGEngine:
    """RAG 引擎 - 企业知识库核心编排"""

    def __init__(self):
        # Qdrant 客户端 (支持本地模式和远程模式)
        if settings.QDRANT_LOCAL_PATH:
            import os
            os.makedirs(settings.QDRANT_LOCAL_PATH, exist_ok=True)
            self.qdrant_client = QdrantClient(
                path=settings.QDRANT_LOCAL_PATH,
            )
            logger.info(f"Qdrant 本地模式: {settings.QDRANT_LOCAL_PATH}")
        else:
            self.qdrant_client = QdrantClient(
                url=settings.QDRANT_URL,
                timeout=60,
            )

        # 嵌入模型
        if settings.OPENAI_API_KEY:
            self.embedding_provider = EmbeddingProvider(
                provider="openai",
                model_name=settings.OPENAI_EMBEDDING_MODEL,
                api_key=settings.OPENAI_API_KEY,
            )
        else:
            self.embedding_provider = EmbeddingProvider(
                provider="ollama",
                model_name=settings.EMBEDDING_MODEL,
                base_url=settings.OLLAMA_BASE_URL,
            )

        # 文本分块器
        self.chunker = TextChunker(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
        )

        # LLM 客户端
        self.llm = self._init_llm()

        # 合成器
        self.synthesizer = Synthesizer(llm_client=self.llm)

        # 重排序器
        self.reranker = Reranker()

        # 检索器缓存 (保持 BM25 索引状态)
        self._retrievers: dict[str, HybridRetriever] = {}

        logger.info("RAG 引擎初始化完成")

    def _init_llm(self):
        """初始化 LLM

        如果 Ollama/OpenAI 不可用，返回 None（仅支持检索，无法问答）
        """
        if settings.OPENAI_API_KEY:
            try:
                from llama_index.llms.openai import OpenAI

                return OpenAI(
                    model=settings.OPENAI_LLM_MODEL,
                    api_key=settings.OPENAI_API_KEY,
                    temperature=0.1,
                    max_tokens=2048,
                )
            except Exception as e:
                logger.warning(f"OpenAI LLM 初始化失败: {e}")
                return None
        else:
            try:
                from llama_index.llms.ollama import Ollama

                llm = Ollama(
                    model=settings.LLM_MODEL,
                    base_url=settings.OLLAMA_BASE_URL,
                    temperature=0.1,
                    request_timeout=settings.LLM_REQUEST_TIMEOUT,
                )
                logger.info(f"Ollama LLM 初始化完成: {settings.LLM_MODEL}")
                return llm
            except Exception as e:
                logger.warning(f"Ollama LLM 初始化失败: {e}")
                return None

    def _get_retriever(self, collection_name: str) -> HybridRetriever:
        """获取检索器实例 (缓存以保持 BM25 索引)"""
        if collection_name not in self._retrievers:
            self._retrievers[collection_name] = HybridRetriever(
                qdrant_client=self.qdrant_client,
                collection_name=collection_name,
            )
        return self._retrievers[collection_name]

    async def ensure_collection(self, collection_name: str):
        """确保 Qdrant collection 存在"""
        collections = self.qdrant_client.get_collections().collections
        existing = {c.name for c in collections}

        if collection_name not in existing:
            self.qdrant_client.create_collection(
                collection_name=collection_name,
                vectors_config=models.VectorParams(
                    size=settings.EMBEDDING_DIM,
                    distance=models.Distance.COSINE,
                ),
                optimizers_config=models.OptimizersConfigDiff(
                    default_segment_number=2,
                ),
                hnsw_config=models.HnswConfigDiff(
                    m=16,
                    ef_construct=100,
                    full_scan_threshold=10000,
                ),
            )
            logger.info(f"创建 Qdrant collection: {collection_name}")

    async def index_document(
        self,
        file_path: str,
        collection_name: str,
        chunk_strategy: str = "recursive",
        metadata: Optional[dict] = None,
    ) -> int:
        """索引文档到知识库

        Args:
            file_path: 文件路径
            collection_name: Qdrant collection 名称
            chunk_strategy: 分块策略
            metadata: 附加元数据

        Returns:
            写入的块数
        """
        # 1. 确保 collection 存在
        await self.ensure_collection(collection_name)

        # 2. 读取文档
        text, doc_meta = DocumentReader.read(file_path)
        if not text.strip():
            raise ValueError(f"文档内容为空: {file_path}")

        # 3. 分块
        chunks = self.chunker.chunk(text, strategy=chunk_strategy)

        if not chunks:
            logger.warning(f"文档分块后为空: {file_path}")
            return 0

        # 4. 构建向量并写入 Qdrant
        metadata = metadata or {}
        points = []

        for chunk in chunks:
            chunk_text = chunk["text"]
            if not chunk_text.strip():
                continue

            # 获取向量
            vector = self.embedding_provider.get_embedding(chunk_text)

            # 构建 payload
            payload = {
                "text": chunk_text,
                "chunk_index": chunk["index"],
                "filename": metadata.get("filename", os.path.basename(file_path)),
                "file_path": file_path,
                "file_type": metadata.get("file_type", doc_meta.get("format", "")),
            }
            # 合并文档元数据
            if doc_meta:
                payload.update(
                    {f"doc_{k}": v for k, v in doc_meta.items() if k != "source"}
                )
            # 合并用户自定义元数据
            if metadata:
                payload.update(metadata)
            # 合并分块元数据
            if chunk.get("metadata"):
                payload.update(chunk["metadata"])

            points.append(
                models.PointStruct(
                    id=hash(f"{file_path}:{chunk['index']}") % (2**63),
                    vector=vector,
                    payload=payload,
                )
            )

        # 批量写入 Qdrant
        if points:
            self.qdrant_client.upsert(
                collection_name=collection_name,
                points=points,
            )

            # 同步更新 BM25 语料
            retriever = self._get_retriever(collection_name)
            for pt in points:
                retriever.add_to_bm25_corpus(pt.id, pt.payload.get("text", ""))

            logger.info(
                f"索引完成: {file_path} -> {collection_name}, "
                f"{len(points)} 个块"
            )

        return len(points)

    async def search(
        self,
        query: str,
        collection_name: str,
        top_k: int = 10,
        filter_condition: Optional[dict] = None,
        use_reranker: bool = True,
        hybrid: bool = True,
    ) -> list[dict]:
        """搜索知识库 (混合检索 + 可选重排序)

        Args:
            query: 查询文本
            collection_name: Qdrant collection 名称
            top_k: 返回结果数
            filter_condition: 过滤条件
            use_reranker: 是否使用重排序
            hybrid: 是否启用混合检索 (向量+BM25)

        Returns:
            检索结果列表
        """
        # 1. 获取查询向量
        query_vector = self.embedding_provider.get_embedding(query)

        # 2. 混合检索 (向量 + BM25 + RRF)
        retriever = self._get_retriever(collection_name)
        results = retriever.search(
            query_vector=query_vector,
            query_text=query,
            top_k=top_k if not use_reranker else top_k * 4,  # 多用结果供 Reranker 选择
            filter_condition=filter_condition,
            hybrid=hybrid,
        )

        # 3. 可选重排序
        if use_reranker and len(results) > 1:
            results = await self.reranker.rerank(
                query=query,
                documents=results,
                top_k=top_k,
            )
        else:
            results = results[:top_k]

        return results

    async def query(
        self,
        query: str,
        collection_name: str,
        chat_history: Optional[list[dict]] = None,
        top_k: int = 5,
        filter_condition: Optional[dict] = None,
        use_reranker: bool = True,
    ) -> dict:
        """完整的 RAG 问答流程

        Args:
            query: 用户问题
            collection_name: 知识库 collection 名称
            chat_history: 对话历史
            top_k: 检索结果数
            filter_condition: 过滤条件
            use_reranker: 是否使用重排序

        Returns:
            包含 answer 和 sources 的字典
        """
        # 1. 检索相关文档
        retrieved_docs = await self.search(
            query=query,
            collection_name=collection_name,
            top_k=top_k,
            filter_condition=filter_condition,
            use_reranker=use_reranker,
        )

        # 2. 生成答案
        result = await self.synthesizer.synthesize(
            query=query,
            retrieved_docs=retrieved_docs,
            chat_history=chat_history,
        )

        return result

    async def delete_document(
        self,
        collection_name: str,
        file_path: str,
    ):
        """从知识库删除文档

        Args:
            collection_name: Qdrant collection 名称
            file_path: 文件路径
        """
        # 先获取要删除的点 ID (用于清理 BM25 语料)
        scroll_result = self.qdrant_client.scroll(
            collection_name=collection_name,
            limit=10000,
            with_payload=False,
            with_vectors=False,
            filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="file_path",
                        match=models.MatchValue(value=file_path),
                    )
                ]
            ),
        )
        points_to_delete, _ = scroll_result
        deleted_ids = [pt.id for pt in points_to_delete]

        # 从 Qdrant 删除
        self.qdrant_client.delete(
            collection_name=collection_name,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="file_path",
                            match=models.MatchValue(value=file_path),
                        )
                    ]
                )
            ),
        )

        # 从 BM25 语料删除
        if deleted_ids:
            retriever = self._get_retriever(collection_name)
            for pid in deleted_ids:
                retriever.remove_from_bm25_corpus(pid)

        logger.info(
            f"从 {collection_name} 删除文档: {file_path}, "
            f"移除 {len(deleted_ids)} 个块"
        )
