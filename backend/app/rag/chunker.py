"""文本分块策略"""

from __future__ import annotations

import re
from typing import Optional


class TextChunker:
    """文本分块器，支持多种分块策略"""

    def __init__(
        self,
        chunk_size: int = 512,
        chunk_overlap: int = 128,
        separators: Optional[list[str]] = None,
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separators = separators or ["\n\n", "\n", "。", "；", "，", " ", ""]

    def recursive_chunk(self, text: str) -> list[dict]:
        """递归分块 - 默认分块策略"""
        chunks = []
        self._recursive_split(text, self.separators, 0, chunks)
        return [
            {"text": chunk, "index": i, "metadata": {}}
            for i, chunk in enumerate(chunks)
        ]

    def _recursive_split(
        self, text: str, separators: list[str], depth: int, chunks: list[str]
    ):
        """递归分割文本"""
        if len(text) <= self.chunk_size or depth >= len(separators):
            if text.strip():
                chunks.append(text.strip())
            return

        separator = separators[depth]
        if not separator:
            # 按字符切分
            for i in range(0, len(text), self.chunk_size - self.chunk_overlap):
                chunk = text[i : i + self.chunk_size].strip()
                if chunk:
                    chunks.append(chunk)
            return

        segments = text.split(separator)
        current_chunk = ""

        for segment in segments:
            if not segment.strip():
                continue

            if len(current_chunk) + len(segment) < self.chunk_size:
                if current_chunk:
                    current_chunk += separator
                current_chunk += segment
            else:
                if current_chunk.strip():
                    chunks.append(current_chunk.strip())
                current_chunk = segment

                # 如果单个段就超过块大小，递归细分
                if len(segment) > self.chunk_size:
                    self._recursive_split(
                        segment, separators, depth + 1, chunks
                    )
                    current_chunk = ""

        if current_chunk.strip():
            chunks.append(current_chunk.strip())

    def markdown_chunk(self, text: str) -> list[dict]:
        """Markdown 分块 - 按标题层级分割"""
        chunks = []
        # 匹配 # ~ ###### 标题
        heading_pattern = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)
        sections = heading_pattern.split(text)

        current_section = {"title": "", "level": 0, "content": ""}
        for i, part in enumerate(sections):
            if i % 3 == 1:  # 标题标记 (#)
                level = len(part)
                current_section["level"] = level
            elif i % 3 == 2:  # 标题内容
                current_section["title"] = part.strip()
            else:  # 正文内容
                if current_section["content"] or current_section["title"]:
                    chunks.append(
                        {
                            "text": f"{'#' * current_section['level']} {current_section['title']}\n{part.strip()}"
                            if current_section["title"]
                            else part.strip(),
                            "index": len(chunks),
                            "metadata": {
                                "heading": current_section["title"],
                                "level": current_section["level"],
                            },
                        }
                    )
                    current_section = {"title": "", "level": 0, "content": ""}
                else:
                    chunks.append(
                        {
                            "text": part.strip(),
                            "index": len(chunks),
                            "metadata": {},
                        }
                    )

        return chunks

    def semantic_chunk(self, text: str) -> list[dict]:
        """语义分块 - 按段落和语义完整性分割"""
        # 按空行分割成段落
        paragraphs = re.split(r"\n\s*\n", text)
        chunks = []
        current_chunk = ""

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue

            if len(current_chunk) + len(para) < self.chunk_size:
                if current_chunk:
                    current_chunk += "\n\n"
                current_chunk += para
            else:
                if current_chunk:
                    chunks.append(
                        {
                            "text": current_chunk,
                            "index": len(chunks),
                            "metadata": {},
                        }
                    )
                current_chunk = para

                if len(para) > self.chunk_size:
                    # 长段落需要进一步分割
                    sub_chunks = self.recursive_chunk(para)
                    for sc in sub_chunks:
                        sc["index"] = len(chunks)
                        chunks.append(sc)
                    current_chunk = ""

        if current_chunk:
            chunks.append(
                {
                    "text": current_chunk,
                    "index": len(chunks),
                    "metadata": {},
                }
            )

        return chunks

    def chunk(self, text: str, strategy: str = "recursive") -> list[dict]:
        """统一的切分入口

        Args:
            text: 输入文本
            strategy: 分块策略，可选 'recursive', 'markdown', 'semantic', 'parent_child'

        Returns:
            包含 text, index, metadata 的块列表
        """
        if strategy == "markdown":
            chunks = self.markdown_chunk(text)
            # 对过大的 markdown 块做二次切分
            final_chunks = []
            for chunk in chunks:
                if len(chunk["text"]) > self.chunk_size * 1.5:
                    sub_chunks = self.recursive_chunk(chunk["text"])
                    for sc in sub_chunks:
                        sc["index"] = len(final_chunks)
                        sc["metadata"] = chunk["metadata"]
                        final_chunks.append(sc)
                else:
                    chunk["index"] = len(final_chunks)
                    final_chunks.append(chunk)
            return final_chunks
        elif strategy == "semantic":
            return self.semantic_chunk(text)
        elif strategy == "parent_child":
            return self.parent_child_chunk(text)
        else:
            return self.recursive_chunk(text)

    def parent_child_chunk(
        self,
        text: str,
        parent_chunk_size: Optional[int] = None,
        child_chunk_size: Optional[int] = None,
    ) -> list[dict]:
        """父子分块策略

        父块: 较大的块，包含完整上下文
        子块: 较小的块，用于精确检索
        检索到子块后，返回父块文本作为上下文

        Args:
            text: 输入文本
            parent_chunk_size: 父块大小 (默认 self.chunk_size * 2)
            child_chunk_size: 子块大小 (默认 self.chunk_size // 2)

        Returns:
            包含 text, index, metadata (含 parent_text) 的块列表
        """
        parent_size = parent_chunk_size or self.chunk_size * 2
        child_size = child_chunk_size or max(self.chunk_size // 2, 128)

        # 先按段落分割
        paragraphs = re.split(r"\n\s*\n", text)
        paragraphs = [p.strip() for p in paragraphs if p.strip()]

        if not paragraphs:
            return []

        # 构建父块 (累积段落直到达到 parent_size)
        parent_chunks = []
        current_parent = ""
        for para in paragraphs:
            if len(current_parent) + len(para) < parent_size:
                if current_parent:
                    current_parent += "\n\n"
                current_parent += para
            else:
                if current_parent:
                    parent_chunks.append(current_parent)
                current_parent = para

                # 如果单个段落超过 parent_size，递归分割
                if len(para) > parent_size:
                    sub = self.recursive_chunk(para)
                    for s in sub:
                        parent_chunks.append(s["text"])
                    current_parent = ""

        if current_parent:
            parent_chunks.append(current_parent)

        # 对每个父块，生成子块
        chunks = []
        for parent_idx, parent_text in enumerate(parent_chunks):
            # 将父块按 child_size 递归分块
            original_chunker = TextChunker(
                chunk_size=child_size,
                chunk_overlap=self.chunk_overlap // 2,
                separators=self.separators,
            )
            child_chunks = original_chunker.recursive_chunk(parent_text)

            if not child_chunks:
                chunks.append(
                    {
                        "text": parent_text,
                        "index": len(chunks),
                        "metadata": {
                            "parent_text": parent_text,
                            "parent_index": parent_idx,
                            "strategy": "parent_child",
                        },
                    }
                )
            else:
                for cc in child_chunks:
                    chunks.append(
                        {
                            "text": cc["text"],
                            "index": len(chunks),
                            "metadata": {
                                "parent_text": parent_text,
                                "parent_index": parent_idx,
                                "strategy": "parent_child",
                            },
                        }
                    )

        return chunks
