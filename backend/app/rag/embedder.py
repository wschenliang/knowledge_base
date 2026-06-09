"""嵌入模型封装 - 支持 Ollama 和 OpenAI，自带降级处理"""

from __future__ import annotations

import hashlib
import struct
from typing import Optional

from loguru import logger

from app.config import settings


class _OllamaHTTPClient:
    """Ollama Embedding HTTP 客户端（绕过 llama-index 的进程启动问题）"""

    def __init__(self, model_name: str, base_url: str):
        self.model_name = model_name
        self.base_url = base_url.rstrip("/")

    def get_text_embedding(self, text: str) -> list[float]:
        import json, urllib.request

        req = urllib.request.Request(
            url=f"{self.base_url}/api/embeddings",
            data=json.dumps({"model": self.model_name, "prompt": text}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
        return data["embedding"]

    def get_text_embedding_batch(self, texts: list[str]) -> list[list[float]]:
        import json, urllib.request

        req = urllib.request.Request(
            url=f"{self.base_url}/api/embed",
            data=json.dumps({"model": self.model_name, "input": texts}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = json.loads(resp.read())
        return data["embeddings"]


class EmbeddingProvider:
    """嵌入模型提供者

    优先级:
    1. OpenAI (设置 OPENAI_API_KEY)
    2. Ollama (本地模型)
    3. 降级: 基于文本哈希的确定性向量 (仅用于测试，语义效果差)
    """

    def __init__(
        self,
        provider: str = "ollama",
        model_name: str = "bge-m3",
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        self.provider = provider
        self.model_name = model_name
        self._client = None
        self._dim = settings.EMBEDDING_DIM
        self._fallback = False

        if provider == "openai":
            self._init_openai(api_key=api_key)
        else:
            self._init_ollama(base_url=base_url)

        # 如果初始化失败且没有可用客户端，启用降级模式
        if self._client is None:
            self._fallback = True
            logger.warning(
                f"⚠️ 嵌入模型不可用，启用哈希降级模式 (维度={self._dim})。"
                f"请安装 Ollama 并拉取模型，或设置 OPENAI_API_KEY。"
            )

    def _init_openai(self, api_key: Optional[str] = None):
        """初始化 OpenAI Embedding"""
        try:
            from llama_index.embeddings.openai import OpenAIEmbedding

            self._client = OpenAIEmbedding(
                model_name=self.model_name,
                api_key=api_key,
            )
            logger.info(f"OpenAI Embedding 初始化完成: {self.model_name}")
        except Exception as e:
            logger.warning(f"OpenAI Embedding 初始化失败: {e}")

    def _init_ollama(self, base_url: Optional[str] = None):
        """初始化 Ollama Embedding（直连 HTTP API，绕过 llama-index 的进程启动问题）"""
        url = base_url or "http://localhost:11434"
        try:
            # 测试 Ollama 服务连通性
            import json, urllib.request

            test_req = urllib.request.Request(
                url=f"{url}/api/embeddings",
                data=json.dumps({"model": self.model_name, "prompt": "test"}).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(test_req, timeout=30) as resp:
                result = json.loads(resp.read())
            dim = len(result["embedding"])
            self._dim = dim
            self._client = _OllamaHTTPClient(self.model_name, url)
            logger.info(
                f"Ollama Embedding 初始化完成: {self.model_name} "
                f"@ {url}, dim={dim}"
            )
        except Exception as e:
            logger.warning(f"Ollama Embedding 初始化失败: {e}")
            self._client = None

    @staticmethod
    def _hash_embedding(text: str, dim: int = 1536) -> list[float]:
        """基于文本哈希生成确定性向量（降级用）

        将文本的多个哈希值映射到维度空间，
        保证同一文本始终得到相同向量。
        """
        import random
        import math

        text_bytes = text.encode("utf-8")
        # 使用 md5 哈希作为种子，生成确定性伪随机向量
        seed = struct.unpack("I", hashlib.md5(text_bytes).digest()[:4])[0]
        rng = random.Random(seed)
        # 生成单位球面上的随机向量
        vec = [rng.gauss(0, 1) for _ in range(dim)]
        norm = math.sqrt(sum(x * x for x in vec))
        return [x / norm for x in vec]

    def get_embedding(self, text: str) -> list[float]:
        """获取单个文本的嵌入向量"""
        if self._fallback or self._client is None:
            return self._hash_embedding(text, self._dim)
        try:
            return self._client.get_text_embedding(text)
        except Exception as e:
            logger.warning(f"嵌入调用失败，降级到哈希模式: {e}")
            return self._hash_embedding(text, self._dim)

    def get_embeddings(self, texts: list[str]) -> list[list[float]]:
        """批量获取文本的嵌入向量"""
        if self._fallback or self._client is None:
            return [self._hash_embedding(t, self._dim) for t in texts]
        try:
            return self._client.get_text_embedding_batch(texts)
        except Exception as e:
            logger.warning(f"批量嵌入调用失败，降级到哈希模式: {e}")
            return [self._hash_embedding(t, self._dim) for t in texts]

    @property
    def client(self):
        return self._client

    @property
    def available(self) -> bool:
        return not self._fallback
