"""答案合成器 - 将检索结果和 LLM 结合生成答案"""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator, Optional

from app.rag.prompt_templates import QA_PROMPT_TEMPLATE

logger = logging.getLogger(__name__)


class Synthesizer:
    """答案合成器"""

    def __init__(self, llm_client):
        self.llm = llm_client

    async def synthesize(
        self,
        query: str,
        retrieved_docs: list[dict],
        chat_history: list[dict] = None,
    ) -> dict:
        """生成答案

        Args:
            query: 用户问题
            retrieved_docs: 检索到的文档块
            chat_history: 对话历史

        Returns:
            包含 answer 和 sources 的字典
        """
        if not retrieved_docs:
            return {
                "answer": "抱歉，在知识库中没有找到与您问题相关的文档内容。请尝试换个问题，或确认相关文档已上传到知识库。",
                "sources": [],
            }

        # 构建上下文
        context_parts = []
        sources = []
        for i, doc in enumerate(retrieved_docs):
            text = doc.get("text", "")
            metadata = doc.get("metadata", {})
            source_name = metadata.get(
                "filename", metadata.get("source", f"文档 {i + 1}")
            )
            context_parts.append(
                f"[文档 {i + 1}] (来源: {source_name})\n{text}"
            )
            sources.append(
                {
                    "index": i,
                    "source": source_name,
                    "text": text[:500],  # 截取前500字符作为引用
                    "score": round(doc.get("score", doc.get("rerank_score", 0)), 4),
                }
            )

        context_str = "\n\n---\n\n".join(context_parts)

        # 格式化对话历史
        history_str = ""
        if chat_history:
            history_lines = []
            for msg in chat_history[-6:]:  # 仅保留最近3轮对话
                role = msg.get("role", "")
                content = msg.get("content", "")
                history_lines.append(f"{'用户' if role == 'user' else '助手'}: {content}")
            history_str = "\n".join(history_lines)

        # 如果没有 LLM（Ollama/OpenAI 均不可用），直接返回检索结果
        if self.llm is None:
            answer_parts = [f"根据以下检索到的相关内容，回答了您的问题："]
            for i, src in enumerate(sources[:3]):
                answer_parts.append(f"\n---\n📄 来自 [{src['source']}]\n{src['text'][:200]}")
            return {
                "answer": "\n".join(answer_parts) + "\n\n💡 提示：配置 Ollama 或 OpenAI API Key 后可启用 AI 问答。",
                "sources": sources,
            }

        # 构建提示词
        prompt = QA_PROMPT_TEMPLATE.format(
            context_str=context_str,
            chat_history=history_str or "无历史对话",
            query_str=query,
        )

        # 调用 LLM
        try:
            response = await self.llm.acomplete(prompt)
            answer = response.text.strip()
        except Exception as e:
            logger.error(f"LLM 调用失败: {e}")
            answer = f"抱歉，生成回答时出现错误: {str(e)}"

        return {"answer": answer, "sources": sources}

    def _build_prompt(
        self,
        query: str,
        retrieved_docs: list[dict],
        chat_history: list[dict] = None,
    ) -> tuple[str, list[dict]]:
        """构建提示词和来源列表（公共逻辑抽取）

        Returns:
            (prompt, sources) 元组；如果没有 LLM 则 prompt 为 None
        """
        # 构建上下文
        context_parts = []
        sources = []
        for i, doc in enumerate(retrieved_docs):
            text = doc.get("text", "")
            metadata = doc.get("metadata", {})
            source_name = metadata.get(
                "filename", metadata.get("source", f"文档 {i + 1}")
            )
            context_parts.append(
                f"[文档 {i + 1}] (来源: {source_name})\n{text}"
            )
            sources.append(
                {
                    "index": i,
                    "source": source_name,
                    "text": text[:500],
                    "score": round(doc.get("score", doc.get("rerank_score", 0)), 4),
                }
            )

        context_str = "\n\n---\n\n".join(context_parts)

        # 格式化对话历史
        history_str = ""
        if chat_history:
            history_lines = []
            for msg in chat_history[-6:]:
                role = msg.get("role", "")
                content = msg.get("content", "")
                history_lines.append(
                    f"{'用户' if role == 'user' else '助手'}: {content}"
                )
            history_str = "\n".join(history_lines)

        if self.llm is None:
            return None, sources

        prompt = QA_PROMPT_TEMPLATE.format(
            context_str=context_str,
            chat_history=history_str or "无历史对话",
            query_str=query,
        )
        return prompt, sources

    async def synthesize_stream(
        self,
        query: str,
        retrieved_docs: list[dict],
        chat_history: list[dict] = None,
    ) -> AsyncGenerator[dict, None]:
        """流式生成答案

        Yields:
            dict: 包含 type 字段的事件字典
                - {"type": "sources", "sources": [...]}
                - {"type": "token", "content": "..."}
                - {"type": "done", "answer": "完整文本"}
                - {"type": "error", "content": "错误信息"}
        """
        if not retrieved_docs:
            yield {
                "type": "done",
                "answer": "抱歉，在知识库中没有找到与您问题相关的文档内容。请尝试换个问题，或确认相关文档已上传到知识库。",
                "sources": [],
            }
            return

        prompt, sources = self._build_prompt(query, retrieved_docs, chat_history)

        # 先发送来源信息
        yield {"type": "sources", "sources": sources}

        # 没有 LLM 的情况
        if self.llm is None or prompt is None:
            answer_parts = ["根据以下检索到的相关内容，回答了您的问题："]
            for i, src in enumerate(sources[:3]):
                answer_parts.append(
                    f"\n---\n📄 来自 [{src['source']}]\n{src['text'][:200]}"
                )
            fallback = (
                "\n".join(answer_parts)
                + "\n\n💡 提示：配置 Ollama 或 OpenAI API Key 后可启用 AI 问答。"
            )
            yield {"type": "done", "answer": fallback, "sources": sources}
            return

        # 流式调用 LLM
        full_text = ""
        try:
            async for response in await self.llm.astream_complete(prompt):
                delta = response.delta
                if delta:
                    full_text += delta
                    yield {"type": "token", "content": delta}
        except Exception as e:
            logger.error(f"LLM 流式调用失败: {e}")
            yield {"type": "error", "content": f"抱歉，生成回答时出现错误: {str(e)}"}
            return

        yield {"type": "done", "answer": full_text, "sources": sources}
