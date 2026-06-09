"""重排序器 - 支持 Cross-encoder 和 Jina Reranker API"""

from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# Jina Reranker API 配置
JINA_RERANKER_URL = "https://api.jina.ai/v1/rerank"
JINA_RERANKER_MODEL = "jina-reranker-v2-base-multilingual"


class Reranker:
    """重排序器，对检索结果进行精排

    支持两种模式:
    1. Cross-encoder 模型 (本地, 需要 PyTorch + transformers)
    2. Jina Reranker API (云端, 需要 API Key)
    """

    def __init__(
        self,
        model_name: str = "BAAI/bge-reranker-v2-m3",
        jina_api_key: Optional[str] = None,
    ):
        self.model_name = model_name
        self._model = None
        self._tokenizer = None
        # Jina API Key 从环境变量读取
        self._jina_api_key = jina_api_key or os.getenv("JINA_API_KEY", "")

    def _load_cross_encoder(self):
        """延迟加载 Cross-encoder 模型"""
        try:
            from transformers import AutoModelForSequenceClassification, AutoTokenizer

            self._tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self._model = AutoModelForSequenceClassification.from_pretrained(
                self.model_name
            )
            self._model.eval()
            logger.info(f"Cross-encoder 模型加载完成: {self.model_name}")
        except ImportError:
            logger.warning(
                "transformers 未安装，跳过 Cross-encoder。如需使用请安装: "
                "pip install transformers torch"
            )
        except Exception as e:
            logger.warning(f"Cross-encoder 模型加载失败: {e}")
            self._model = None
            self._tokenizer = None

    async def _rerank_jina(
        self, query: str, documents: list[dict], top_k: int
    ) -> list[dict]:
        """使用 Jina Reranker API 重排序"""
        if not self._jina_api_key:
            logger.debug("JINA_API_KEY 未配置，跳过 Jina Reranker")
            return None

        texts = [doc.get("text", "") for doc in documents if doc.get("text")]
        if not texts:
            return None

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    JINA_RERANKER_URL,
                    headers={
                        "Authorization": f"Bearer {self._jina_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": JINA_RERANKER_MODEL,
                        "query": query,
                        "documents": texts,
                        "top_n": top_k,
                    },
                )
                response.raise_for_status()
                result = response.json()

            # 映射返回结果到 documents
            reranked = []
            for item in result.get("results", []):
                idx = item.get("index")
                relevance_score = item.get("relevance_score", 0)
                if idx is not None and idx < len(documents):
                    doc = dict(documents[idx])
                    doc["rerank_score"] = relevance_score
                    doc["source"] = "reranked"
                    reranked.append(doc)

            reranked.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)
            logger.debug(
                f"Jina Reranker: {len(documents)} -> {len(reranked)} 个结果"
            )
            return reranked[:top_k]

        except httpx.HTTPStatusError as e:
            logger.warning(f"Jina Reranker API 错误: {e.response.status_code}")
        except httpx.RequestError as e:
            logger.warning(f"Jina Reranker 请求失败: {e}")
        except Exception as e:
            logger.warning(f"Jina Reranker 异常: {e}")

        return None

    def _rerank_cross_encoder(
        self, query: str, documents: list[dict], top_k: int
    ) -> list[dict]:
        """使用本地 Cross-encoder 模型重排序"""
        if self._model is None:
            self._load_cross_encoder()
        if self._model is None:
            return documents[:top_k]

        try:
            import torch

            pairs = [[query, doc["text"]] for doc in documents]

            inputs = self._tokenizer(
                pairs,
                padding=True,
                truncation=True,
                return_tensors="pt",
                max_length=512,
            )

            with torch.no_grad():
                outputs = self._model(**inputs)
                scores = outputs.logits.squeeze(-1).tolist()

            if not isinstance(scores, list):
                scores = [scores]

            for i, doc in enumerate(documents):
                doc["rerank_score"] = (
                    scores[i] if i < len(scores) else doc.get("score", 0)
                )
                doc["source"] = "reranked"

            documents.sort(
                key=lambda x: x.get("rerank_score", 0), reverse=True
            )
            return documents[:top_k]

        except Exception as e:
            logger.warning(f"Cross-encoder 重排序执行失败: {e}")
            return documents[:top_k]

    async def rerank(
        self,
        query: str,
        documents: list[dict],
        top_k: int = 5,
    ) -> list[dict]:
        """对检索结果进行重排序

        优先级: Jina API > Cross-encoder > 原序截断

        Args:
            query: 原始查询
            documents: 检索结果文档列表
            top_k: 返回 top_k 个结果

        Returns:
            重排序后的结果列表
        """
        if not documents:
            return []

        # 1. 优先尝试 Jina Reranker API (异步、轻量)
        if self._jina_api_key:
            result = await self._rerank_jina(query, documents, top_k)
            if result is not None:
                return result

        # 2. 降级到 Cross-encoder 模型
        result = self._rerank_cross_encoder(query, documents, top_k)
        if result is not None:
            return result

        # 3. 最终降级: 按原分数截断
        return documents[:top_k]
