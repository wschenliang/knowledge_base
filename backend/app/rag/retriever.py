"""检索器 - 混合检索 (向量 + BM25 + RRF 融合)"""

from __future__ import annotations

import logging
import math
from typing import Optional

from qdrant_client import QdrantClient
from qdrant_client.http import models

logger = logging.getLogger(__name__)


class HybridRetriever:
    """混合检索器: 向量检索 + BM25 关键词检索 + RRF 融合"""

    def __init__(
        self,
        qdrant_client: QdrantClient,
        collection_name: str,
    ):
        self.client = qdrant_client
        self.collection_name = collection_name
        self._bm25_index = None  # rank_bm25 索引，懒加载
        self._bm25_docs: list[dict] = []  # BM25 文档列表, [{"id": point_id, "text": str}]
        self._bm25_loaded = False

    # ===== BM25 语料管理 =====

    def _load_bm25_corpus(self):
        """从 Qdrant 加载所有文档到 BM25 索引"""
        try:
            from rank_bm25 import BM25Okapi

            # Scroll 所有点
            all_points = []
            next_offset = None
            while True:
                scroll_result = self.client.scroll(
                    collection_name=self.collection_name,
                    limit=1000,
                    offset=next_offset,
                    with_payload=True,
                    with_vectors=False,
                )
                points, next_offset = scroll_result
                all_points.extend(points)
                if next_offset is None or len(points) == 0:
                    break

            if not all_points:
                logger.info(f"BM25 语料为空: {self.collection_name}")
                self._bm25_loaded = True
                return

            # 构建 BM25 索引
            texts = []
            docs = []
            for pt in all_points:
                text = pt.payload.get("text", "")
                if text.strip():
                    texts.append(text)
                    docs.append({"id": pt.id, "text": text})

            if texts:
                tokenized = [text.split() for text in texts]
                self._bm25_index = BM25Okapi(tokenized)
                self._bm25_docs = docs
                logger.info(
                    f"BM25 索引加载完成: {self.collection_name}, "
                    f"{len(docs)} 个文档"
                )
            else:
                logger.warning(f"BM25 语料为空: {self.collection_name}")

            self._bm25_loaded = True

        except ImportError:
            logger.warning("rank_bm25 未安装，BM25 检索不可用")
            self._bm25_loaded = True
        except Exception as e:
            logger.error(f"BM25 索引加载失败: {e}")
            self._bm25_loaded = True

    def _ensure_bm25_loaded(self):
        """确保 BM25 索引已加载"""
        if not self._bm25_loaded:
            self._load_bm25_corpus()

    def add_to_bm25_corpus(self, point_id: int | str, text: str):
        """增量添加文档到 BM25 语料"""
        self._ensure_bm25_loaded()
        if text.strip():
            self._bm25_docs.append({"id": point_id, "text": text})
            # 标记需要重建索引
            self._bm25_index = None

    def remove_from_bm25_corpus(self, point_id: int | str):
        """从 BM25 语料删除文档"""
        self._ensure_bm25_loaded()
        self._bm25_docs = [d for d in self._bm25_docs if d["id"] != point_id]
        self._bm25_index = None

    def _rebuild_bm25_index(self):
        """重建 BM25 索引"""
        from rank_bm25 import BM25Okapi

        if self._bm25_docs:
            tokenized = [d["text"].split() for d in self._bm25_docs]
            self._bm25_index = BM25Okapi(tokenized)
        else:
            self._bm25_index = None

    # ===== BM25 搜索 =====

    def _bm25_search(self, query_text: str, top_k: int = 20) -> list[dict]:
        """BM25 关键词检索"""
        if self._bm25_index is None:
            self._rebuild_bm25_index()
        if self._bm25_index is None or not self._bm25_docs:
            return []

        tokenized_query = query_text.split()
        scores = self._bm25_index.get_scores(tokenized_query)

        # 获取 top_k 结果
        indexed = list(enumerate(scores))
        indexed.sort(key=lambda x: x[1], reverse=True)
        top_results = [idx for idx, _ in indexed[:top_k] if scores[idx] > 0]

        results = []
        for idx in top_results:
            doc = self._bm25_docs[idx]
            results.append(
                {
                    "id": doc["id"],
                    "score": float(scores[idx]),
                    "text": doc["text"],
                    "source": "bm25",
                }
            )
        return results

    # ===== 向量搜索 =====

    def _vector_search(
        self,
        query_vector: list[float],
        top_k: int = 30,
        score_threshold: Optional[float] = None,
        filter_condition: Optional[dict] = None,
    ) -> list[dict]:
        """向量相似度检索"""
        qdrant_filter = None
        if filter_condition:
            qdrant_filter = models.Filter(**filter_condition)

        vector_results = self.client.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            query_filter=qdrant_filter,
            limit=top_k,
            with_payload=True,
            score_threshold=score_threshold,
        ).points

        results = []
        seen_ids = set()
        for point in vector_results:
            if point.id not in seen_ids:
                results.append(
                    {
                        "id": point.id,
                        "score": point.score,
                        "text": point.payload.get("text", ""),
                        "metadata": {
                            k: v
                            for k, v in point.payload.items()
                            if k != "text"
                        },
                        "source": "vector",
                    }
                )
                seen_ids.add(point.id)
        return results

    # ===== RRF 融合 =====

    @staticmethod
    def _rrf_fusion(
        vector_results: list[dict],
        bm25_results: list[dict],
        k: int = 60,
        top_k: int = 20,
    ) -> list[dict]:
        """Reciprocal Rank Fusion 融合两个检索结果集"""
        # 构建 id -> score 映射（RRF score）
        rrf_scores: dict[int | str, float] = {}
        id_to_doc: dict[int | str, dict] = {}

        # 处理向量结果
        for rank, doc in enumerate(vector_results):
            doc_id = doc["id"]
            rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
            if doc_id not in id_to_doc:
                id_to_doc[doc_id] = {**doc, "rrf_score": 0.0}

        # 处理 BM25 结果
        for rank, doc in enumerate(bm25_results):
            doc_id = doc["id"]
            rrf_scores[doc_id] = rrf_scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
            if doc_id not in id_to_doc:
                id_to_doc[doc_id] = {**doc, "rrf_score": 0.0}

        # 更新 rrf_score
        for doc_id in id_to_doc:
            id_to_doc[doc_id]["rrf_score"] = rrf_scores.get(doc_id, 0.0)
            # 记录来源类型
            sources = []
            if doc_id in {d["id"] for d in vector_results}:
                sources.append("vector")
            if doc_id in {d["id"] for d in bm25_results}:
                sources.append("bm25")
            id_to_doc[doc_id]["sources"] = "+".join(sources)
            # 使用 RRF 分数作为 score
            id_to_doc[doc_id]["score"] = rrf_scores.get(doc_id, 0.0)

        # 按 RRF 分数排序
        fused = sorted(
            id_to_doc.values(),
            key=lambda x: x["rrf_score"],
            reverse=True,
        )

        return fused[:top_k]

    # ===== 主入口 =====

    def search(
        self,
        query_vector: list[float],
        query_text: str = "",
        top_k: int = 20,
        score_threshold: Optional[float] = None,
        filter_condition: Optional[dict] = None,
        hybrid: bool = True,
        vector_top_k: int = 30,
        bm25_top_k: int = 20,
    ) -> list[dict]:
        """执行混合检索

        Args:
            query_vector: 查询向量
            query_text: 查询文本 (用于 BM25)
            top_k: 最终返回结果数
            score_threshold: 向量分数阈值
            filter_condition: Qdrant 过滤条件
            hybrid: 是否启用混合检索 (否则仅向量检索)
            vector_top_k: 向量检索取 top_k
            bm25_top_k: BM25 检索取 top_k

        Returns:
            检索结果列表
        """
        # 1. 向量检索 (always)
        vector_results = self._vector_search(
            query_vector=query_vector,
            top_k=vector_top_k,
            score_threshold=score_threshold,
            filter_condition=filter_condition,
        )

        # 2. 如果不启用混合检索，直接返回向量结果
        if not hybrid or not query_text.strip():
            return vector_results[:top_k]

        # 3. BM25 检索
        self._ensure_bm25_loaded()
        bm25_results = self._bm25_search(
            query_text=query_text,
            top_k=bm25_top_k,
        )

        # 4. RRF 融合
        if bm25_results:
            fused = self._rrf_fusion(
                vector_results=vector_results,
                bm25_results=bm25_results,
                top_k=top_k,
            )
            logger.debug(
                f"混合检索: 向量={len(vector_results)}, "
                f"BM25={len(bm25_results)}, 融合后={len(fused)}"
            )
            return fused
        else:
            return vector_results[:top_k]
