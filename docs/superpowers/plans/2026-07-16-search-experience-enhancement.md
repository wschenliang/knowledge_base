# CogniBase 搜索结果增强包实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 CogniBase 企业知识库搜索结果增加关键词高亮与高级筛选能力——前端在 `/search` 语义搜索结果卡片、`/chat` 引用来源卡片、聊天回答正文三处场景渲染 BM25 命中词 `<mark>` 高亮，并在 SearchBox 旁提供抽屉式筛选面板（文件类型 / 上传者 / 标签 / 文件名包含）。

**Architecture:** 后端在 BM25 命中片段上提取关键词（子串匹配 + 大小写不敏感 + 中英文标点切分，不上 jieba），通过 `Document.uploader_id` 持久化上传者关联并在 Qdrant payload 中按写入时快照 `uploader_username / tag_ids / tag_names / collection_id / document_id`；新增 `GET /api/v1/search/facets` 一次 SQL 联查返回可选筛选维度。前端 `HighlightedText` 组件做区间合并渲染（不用 dangerouslySetInnerHTML），`AdvancedFilterPanel` 用 `createPortal` 渲染到 `document.body`，`SearchBox` 维护"编辑中 / 已应用"两套 state，`SearchRequest / ChatRequest` 增加可选 `filters`。

**Tech Stack:** FastAPI · SQLAlchemy 2.0 async ORM · Qdrant · Pydantic v2 · pytest + httpx ASGITransport；Next.js 16 · React 19 · Tailwind 4 · TypeScript · lucide-react；前端 ESLint 规则已对齐 `react-hooks/set-state-in-effect` 豁免与 `createPortal` 渲染约定。

---

## File Structure

实施中将要新建 / 修改的文件总览：

| 文件 | 类型 | 职责 |
|---|---|---|
| `backend/app/models/document.py` | 修改 | `Document` 新增 `uploader_id` 字段 |
| `backend/app/scripts/migrate_v6_uploader.py` | 新建 | 加列 + 索引 + FK + `--rollback` |
| `backend/app/rag/retriever.py` | 修改 | 新增 `get_query_highlight_terms()`；扩展 `_vector_search` 透传 filter |
| `backend/app/rag/engine.py` | 修改 | `index_document` payload 写入新字段；`search()` 返回 `highlight_terms` |
| `backend/app/services/document_service.py` | 修改 | `upload_document` 写入 `uploader_id` |
| `backend/app/api/documents.py` | 修改 | 上传接口 `metadata` 注入 `uploader_id` / `uploader_username` |
| `backend/app/schemas/chat.py` | 修改 | 新增 `SearchFilters`、`SearchResultItem` 扩展、`FacetOption`、`SearchFacetsResponse` |
| `backend/app/services/chat_service.py` | 修改 | `search()` / `chat()` / `chat_stream()` 接受 filters 并透传 |
| `backend/app/api/search.py` | 修改 | `/search` 接受 filters；新增 `GET /search/facets` |
| `backend/app/api/chat.py` | 修改 | `/chat`、`/chat/stream` 接受 filters |
| `backend/tests/test_highlight.py` | 新建 | 命中词提取 + Qdrant filter 透传测试 |
| `backend/tests/test_search_filters.py` | 新建 | filters 端到端 + facets 端点测试 |
| `frontend/src/types/index.ts` | 修改 | 新增 `SearchFilters`、`SearchFacetsResponse`、`FacetOption`、`HighlightedTextProps` 关联类型 |
| `frontend/src/lib/api.ts` | 修改 | `search()` 接受 filters；新增 `getSearchFacets()` |
| `frontend/src/components/HighlightedText.tsx` | 新建 | 区间合并高亮渲染 |
| `frontend/src/components/AdvancedFilterPanel.tsx` | 新建 | createPortal 抽屉式筛选面板 |
| `frontend/src/components/SearchBox.tsx` | 修改 | 接入 filters + 抽屉按钮 + facet 加载 |
| `frontend/src/components/SourceCard.tsx` | 修改 | 替换纯文本为 HighlightedText + 头部 file_type / uploader |
| `frontend/src/components/ChatBox.tsx` | 修改 | 回答正文用 HighlightedText + 把 filters 传给 chatStream |

---

## Task 1: 后端 ORM 新增 `uploader_id` 字段

**Files:**
- Modify: `backend/app/models/document.py:25-60`（Document 类）

- [ ] **Step 1: 在 `Document` 类添加 `uploader_id` 字段**

打开 `backend/app/models/document.py`，定位到 `Document` 类（约第 25-60 行），在 `metadata_: Mapped[...]` 字段**之前**插入新字段：

```python
uploader_id: Mapped[Optional[str]] = mapped_column(
    String(36),
    ForeignKey("users.id", ondelete="SET NULL"),
    nullable=True,
    index=True,
)
```

说明：
- `nullable=True`：旧文档 `uploader_id = NULL`，UI 显示"未知作者"。
- `on delete="SET NULL"`：上传者被禁用 / 删除不级联删除文档。
- `index=True`：facets 端点按 `uploader_id` 分组走索引。

- [ ] **Step 2: 验证 import 已有**

打开文件头部，确认已有以下 import：

```python
from sqlalchemy import DateTime, String, Text, Boolean, Integer, ForeignKey, Enum as SAEnum, UniqueConstraint
from typing import Optional
```

如缺失，按文件顶部现有风格补齐（**不要重复 import 同一个符号**）。

- [ ] **Step 3: 跑导入测试确认无误**

```bash
cd backend && .venv/Scripts/python -c "from app.models.document import Document; print(Document.uploader_id)"
```

预期输出：`<class 'sqlalchemy.orm.attributes.InstrumentedAttribute'>`

- [ ] **Step 4: 提交**

```bash
git add backend/app/models/document.py
git commit -m "feat(orm): add Document.uploader_id (FK users, SET NULL, indexed)"
```

---

## Task 2: 编写迁移脚本 `migrate_v6_uploader.py`

**Files:**
- Create: `backend/app/scripts/migrate_v6_uploader.py`

- [ ] **Step 1: 写迁移脚本**

新建 `backend/app/scripts/migrate_v6_uploader.py`：

```python
"""v6 迁移：给 ``documents`` 表新增 ``uploader_id`` 列。

幂等：先检查列是否存在，再决定 ADD；多次执行不会出错。
支持 ``--rollback`` 参数回滚。

启动方式：
    cd backend && .venv/Scripts/python scripts/migrate_v6_uploader.py
    cd backend && .venv/Scripts/python scripts/migrate_v6_uploader.py --rollback
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import async_session

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


async def _has_column(db: AsyncSession, table: str, column: str) -> bool:
    rows = await db.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table, "c": column},
    )
    return rows.first() is not None


async def _has_index(db: AsyncSession, index_name: str) -> bool:
    rows = await db.execute(
        text("SELECT 1 FROM pg_indexes WHERE indexname = :n"),
        {"n": index_name},
    )
    return rows.first() is not None


async def _has_constraint(db: AsyncSession, constraint_name: str) -> bool:
    rows = await db.execute(
        text(
            "SELECT 1 FROM information_schema.table_constraints "
            "WHERE constraint_name = :n"
        ),
        {"n": constraint_name},
    )
    return rows.first() is not None


async def apply(db: AsyncSession) -> dict:
    summary = {"column_added": False, "index_added": False, "fk_added": False}

    if not await _has_column(db, "documents", "uploader_id"):
        await db.execute(
            text("ALTER TABLE documents ADD COLUMN uploader_id VARCHAR(36)")
        )
        summary["column_added"] = True
        logger.info("v6 迁移：已添加 documents.uploader_id 列")
    else:
        logger.info("v6 迁移：documents.uploader_id 已存在，跳过 ADD COLUMN")

    if not await _has_index(db, "ix_documents_uploader_id"):
        await db.execute(
            text("CREATE INDEX ix_documents_uploader_id ON documents(uploader_id)")
        )
        summary["index_added"] = True
        logger.info("v6 迁移：已创建 ix_documents_uploader_id 索引")
    else:
        logger.info("v6 迁移：ix_documents_uploader_id 已存在，跳过 CREATE INDEX")

    if not await _has_constraint(db, "fk_documents_uploader_id"):
        await db.execute(
            text(
                "ALTER TABLE documents ADD CONSTRAINT fk_documents_uploader_id "
                "FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE SET NULL"
            )
        )
        summary["fk_added"] = True
        logger.info("v6 迁移：已创建 fk_documents_uploader_id 外键")
    else:
        logger.info("v6 迁移：fk_documents_uploader_id 已存在，跳过 ADD CONSTRAINT")

    await db.commit()
    return summary


async def rollback(db: AsyncSession) -> dict:
    summary = {"fk_dropped": False, "index_dropped": False, "column_dropped": False}

    if await _has_constraint(db, "fk_documents_uploader_id"):
        await db.execute(
            text("ALTER TABLE documents DROP CONSTRAINT fk_documents_uploader_id")
        )
        summary["fk_dropped"] = True
        logger.info("v6 回滚：已删除 fk_documents_uploader_id 外键")

    if await _has_index(db, "ix_documents_uploader_id"):
        await db.execute(text("DROP INDEX ix_documents_uploader_id"))
        summary["index_dropped"] = True
        logger.info("v6 回滚：已删除 ix_documents_uploader_id 索引")

    if await _has_column(db, "documents", "uploader_id"):
        await db.execute(text("ALTER TABLE documents DROP COLUMN uploader_id"))
        summary["column_dropped"] = True
        logger.info("v6 回滚：已删除 documents.uploader_id 列")

    await db.commit()
    return summary


async def main(do_rollback: bool) -> int:
    async with async_session() as db:
        if do_rollback:
            await rollback(db)
        else:
            await apply(db)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="v6 迁移：documents.uploader_id")
    parser.add_argument("--rollback", action="store_true", help="回滚迁移")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(do_rollback=args.rollback)))
```

- [ ] **Step 2: 跑迁移脚本（应用）**

```bash
cd backend && .venv/Scripts/python scripts/migrate_v6_uploader.py
```

预期输出（含三行 `已添加 / 已创建` 与 summary）：列、索引、外键均添加成功。

- [ ] **Step 3: 验证幂等（再跑一次）**

```bash
cd backend && .venv/Scripts/python scripts/migrate_v6_uploader.py
```

预期输出：三行 `已存在，跳过 ...`，无报错。

- [ ] **Step 4: 验证回滚**

```bash
cd backend && .venv/Scripts/python scripts/migrate_v6_uploader.py --rollback
```

预期输出：三行 `已删除 ...`，列、索引、外键全部移除。

- [ ] **Step 5: 重新应用以便后续开发使用**

```bash
cd backend && .venv/Scripts/python scripts/migrate_v6_uploader.py
```

预期：列、索引、外键恢复。

- [ ] **Step 6: 提交**

```bash
git add backend/app/scripts/migrate_v6_uploader.py
git commit -m "feat(db): add v6 migration for documents.uploader_id (idempotent + rollback)"
```

---

## Task 3: `HybridRetriever.get_query_highlight_terms()` + 单元测试

**Files:**
- Modify: `backend/app/rag/retriever.py:1-15`（import）与末尾追加方法
- Create: `backend/tests/test_highlight.py`

- [ ] **Step 1: 在 `retriever.py` 顶部 import 区追加 `re`**

打开 `backend/app/rag/retriever.py`，在第 7 行 `from typing import Optional` **下方**插入：

```python
import re
```

- [ ] **Step 2: 写失败测试**

新建 `backend/tests/test_highlight.py`：

```python
"""测试 HybridRetriever.get_query_highlight_terms()。"""

from __future__ import annotations

from app.rag.retriever import HybridRetriever


def _retriever() -> HybridRetriever:
    # 不依赖 Qdrant（只测纯函数方法）
    return HybridRetriever.__new__(HybridRetriever)


def test_empty_query_returns_empty():
    retriever = _retriever()
    assert retriever.get_query_highlight_terms("", [{"text": "运维指标"}]) == []


def test_no_chunks_returns_empty():
    retriever = _retriever()
    assert retriever.get_query_highlight_terms("运维指标", []) == []


def test_single_term_hit():
    retriever = _retriever()
    chunks = [{"text": "本章介绍运维指标的定义和计算方法"}]
    assert retriever.get_query_highlight_terms("运维指标", chunks) == ["运维指标"]


def test_term_not_in_chunks_returns_empty():
    retriever = _retriever()
    chunks = [{"text": "完全不相关的内容"}]
    assert retriever.get_query_highlight_terms("运维指标", chunks) == []


def test_case_insensitive_match():
    retriever = _retriever()
    chunks = [{"text": "Python is a great language"}]
    assert retriever.get_query_highlight_terms("python", chunks) == ["python"]


def test_multiple_terms_ranked_by_frequency():
    retriever = _retriever()
    chunks = [
        {"text": "运维涉及多个环节"},
        {"text": "指标体系是运维核心"},
        {"text": "运维与监控密不可分"},
    ]
    result = retriever.get_query_highlight_terms("运维 指标", chunks, max_terms=8)
    # 运维出现在 3 个 chunk；指标出现在 1 个
    assert result.index("运维") < result.index("指标")
    assert result == ["运维", "指标"]


def test_punctuation_split_for_chinese_query():
    retriever = _retriever()
    chunks = [{"text": "包含运维、监控、告警多个关键词"}]
    # 中文逗号应被切分
    result = retriever.get_query_highlight_terms("运维、监控", chunks)
    assert "运维" in result
    assert "监控" in result


def test_max_terms_truncation():
    retriever = _retriever()
    chunks = [{"text": "a b c d e f g h i j"}]
    result = retriever.get_query_highlight_terms("a b c d e f g h i j", chunks, max_terms=3)
    assert len(result) == 3


def test_short_term_filtered_out():
    retriever = _retriever()
    chunks = [{"text": "单字 a 不应被高亮"}]
    # 切分后 a 长度 < 2 应被过滤
    assert retriever.get_query_highlight_terms("单字 a", chunks) == ["单字"]
```

- [ ] **Step 3: 跑测试确认失败**

```bash
cd backend && .venv/Scripts/python -m pytest tests/test_highlight.py -v
```

预期：所有用例 FAIL，错误信息包含 `AttributeError: 'HybridRetriever' object has no attribute 'get_query_highlight_terms'`。

- [ ] **Step 4: 实现 `get_query_highlight_terms` 方法**

打开 `backend/app/rag/retriever.py`，定位到 `search()` 方法（第 240 行附近）**之后**，追加：

```python
    # ===== 命中词提取 =====

    # 粗切 query 用的标点正则（空白 + 中英文标点）
    _QUERY_SPLIT_RE = re.compile(r"[\s,。;；、]+")

    @staticmethod
    def _normalize_term(term: str) -> str:
        """归一化：去首尾空白、跳过过短项。"""
        t = term.strip()
        if len(t) < 2:
            return ""
        return t

    def get_query_highlight_terms(
        self,
        query_text: str,
        top_results: list[dict],
        max_terms: int = 8,
    ) -> list[str]:
        """从 BM25 命中片段提取实际出现过的 query 关键词，供前端高亮。

        算法：
        1. 过滤 query_text 为空 / top_results 为空的边界；
        2. 以空白 + 中英文标点粗切 query（不上 jieba）；
        3. 逐 chunk 命中：term.lower() in chunk.text.lower()；
        4. 去重 + 按"出现在多少 chunk"频次降序；
        5. 截断到 max_terms；
        6. 完整短语优先保留到结果首位。
        """
        if not query_text or not query_text.strip():
            return []
        if not top_results:
            return []

        raw_terms = self._QUERY_SPLIT_RE.split(query_text)
        terms = [self._normalize_term(t) for t in raw_terms]
        terms = [t for t in terms if t]

        # 完整短语（如 "运维指标"）若未被切分保留，先放首位
        full_phrase = query_text.strip()
        phrase_first = False
        if (
            full_phrase
            and full_phrase not in terms
            and len(full_phrase) >= 2
            and any(full_phrase.lower() in (r.get("text", "") or "").lower() for r in top_results)
        ):
            phrase_first = True

        chunk_texts = [(r.get("text", "") or "").lower() for r in top_results]

        # 频次 = 该 term 出现在多少个 chunk 的 text 里
        freq: dict[str, int] = {}
        for term in terms:
            t_low = term.lower()
            count = sum(1 for ct in chunk_texts if t_low in ct)
            if count > 0:
                freq[term] = count

        # 按频次降序，再按 term 长度降序，最后按字典序稳定排序
        ranked = sorted(freq.items(), key=lambda kv: (-kv[1], -len(kv[0]), kv[0]))
        result = [term for term, _ in ranked[:max_terms]]

        if phrase_first and full_phrase not in result:
            result.insert(0, full_phrase)
            # 超长则截断末尾
            result = result[:max_terms]

        return result
```

- [ ] **Step 5: 跑测试确认通过**

```bash
cd backend && .venv/Scripts/python -m pytest tests/test_highlight.py -v
```

预期：9 个用例全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add backend/app/rag/retriever.py backend/tests/test_highlight.py
git commit -m "feat(rag): add HybridRetriever.get_query_highlight_terms + tests"
```

---

## Task 4: 在 Pydantic Schema 中新增 `SearchFilters` / `FacetOption` / `SearchFacetsResponse` 并扩展 `SearchResultItem`

**Files:**
- Modify: `backend/app/schemas/chat.py:1-50`

- [ ] **Step 1: 在 `chat.py` 顶部 import 区追加 `List`**

打开 `backend/app/schemas/chat.py`，第 5 行 `from typing import Optional` 修改为：

```python
from typing import List, Optional
```

- [ ] **Step 2: 扩展 `SourceItem` 与 `SearchRequest`**

在 `SourceItem` 类（现有第 11-16 行）**之后**，将 `SourceItem` 替换为扩展版本（保留 index/source/text/score，新增可选字段）：

```python
class SourceItem(BaseModel):
    """引用来源项（向后兼容：所有新字段默认空值）"""
    index: int
    source: str
    text: str
    score: float
    file_type: Optional[str] = None
    uploader_username: Optional[str] = None
    document_id: Optional[str] = None
    tag_ids: List[str] = []
    highlight_terms: List[str] = []
```

将 `SearchRequest` 替换为：

```python
class SearchRequest(BaseModel):
    """搜索请求（向后兼容：filters 默认 None）"""
    query: str
    collection_id: str
    top_k: int = 10
    use_reranker: bool = True
    filters: Optional["SearchFilters"] = None
```

- [ ] **Step 3: 新增 `SearchFilters` / `FacetOption` / `SearchFacetsResponse`**

在 `SearchRequest` **之前**（即第 35 行附近 `class SearchRequest(BaseModel):` 上方）插入：

```python
class SearchFilters(BaseModel):
    """高级搜索筛选条件（向后兼容：所有字段 Optional）"""
    file_types: Optional[List[str]] = None      # 例如 ["pdf", "docx"]
    uploader_ids: Optional[List[str]] = None    # user_id 列表
    tag_ids: Optional[List[str]] = None         # tag_id 列表
    filename_contains: Optional[str] = None     # 文件名 LIKE 模糊匹配


class FacetOption(BaseModel):
    """筛选维度的一个可选值"""
    value: str          # uploader_id / tag_id / file_type
    label: str          # 显示文本
    count: int          # 当前 KB 内匹配文档数


class SearchFacetsResponse(BaseModel):
    """搜索筛选面板的可选值"""
    uploaders: List[FacetOption]
    tags: List[FacetOption]
    file_types: List[FacetOption]
```

- [ ] **Step 4: 扩展 `SearchResponse`**

将 `SearchResponse`（第 43-47 行）替换为：

```python
class SearchResponse(BaseModel):
    """搜索响应"""
    query: str
    results: List[SourceItem]
    total: int
    applied_filters: Optional[SearchFilters] = None   # 回显当前生效筛选
```

- [ ] **Step 5: 扩展 `ChatRequest`**

将 `ChatRequest`（第 19-25 行）替换为：

```python
class ChatRequest(BaseModel):
    """问答请求"""
    query: str
    collection_id: str
    conversation_id: Optional[str] = None
    top_k: int = 5
    use_reranker: bool = True
    filters: Optional[SearchFilters] = None
```

- [ ] **Step 6: 用 `model_rebuild()` 解决前向引用**

打开 `backend/app/schemas/chat.py` 文件末尾（第 102 行后），追加：

```python
# 解决 SearchRequest.filters 前向引用 SearchFilters
SearchRequest.model_rebuild()
```

- [ ] **Step 7: 跑导入验证**

```bash
cd backend && .venv/Scripts/python -c "
from app.schemas.chat import (
    SearchFilters, FacetOption, SearchFacetsResponse,
    SearchRequest, SearchResponse, SourceItem, ChatRequest,
)
req = SearchRequest(query='x', collection_id='c')
assert req.filters is None
assert SearchFilters().model_dump(exclude_none=True) == {}
print('OK')
"
```

预期输出：`OK`。

- [ ] **Step 8: 提交**

```bash
git add backend/app/schemas/chat.py
git commit -m "feat(schema): add SearchFilters, FacetOption, SearchFacetsResponse; extend SourceItem"
```

---

## Task 5: `RAGEngine.index_document()` payload 写入新字段 + `DocumentService.upload_document` 写入 `uploader_id`

**Files:**
- Modify: `backend/app/rag/engine.py:142-232`（`index_document` 方法）
- Modify: `backend/app/services/document_service.py:133-173`（`upload_document` 方法）
- Modify: `backend/app/api/documents.py:61-100`（上传路由注入 metadata）

- [ ] **Step 1: 修改 `engine.py` 中 `index_document` payload**

打开 `backend/app/rag/engine.py`，定位第 188-194 行的 payload 构造：

```python
            payload = {
                "text": chunk_text,
                "chunk_index": chunk["index"],
                "filename": metadata.get("filename", os.path.basename(file_path)),
                "file_path": file_path,
                "file_type": metadata.get("file_type", doc_meta.get("format", "")),
            }
```

替换为：

```python
            payload = {
                "text": chunk_text,
                "chunk_index": chunk["index"],
                "filename": metadata.get("filename", os.path.basename(file_path)),
                "file_path": file_path,
                "file_type": metadata.get("file_type", doc_meta.get("format", "")),
                # 写入时一次性快照到 Qdrant payload（避免跨集合 join）
                "document_id": metadata.get("document_id", ""),
                "collection_id": metadata.get("collection_id", ""),
                "uploader_id": metadata.get("uploader_id", ""),
                "uploader_username": metadata.get("uploader_username", ""),
                "tag_ids": metadata.get("tag_ids", []),
                "tag_names": metadata.get("tag_names", []),
            }
```

- [ ] **Step 2: 修改 `document_service.upload_document` 接受并写入 `uploader_id`**

打开 `backend/app/services/document_service.py`，定位第 133-173 行的 `upload_document`，将整个方法签名与 Document 构造替换为：

```python
    async def upload_document(
        self,
        collection_id: str,
        filename: str,
        file_content: bytes,
        file_type: str,
        uploader_id: Optional[str] = None,
        db: Optional[AsyncSession] = None,
    ) -> Document:
        """上传文档"""
        # 存储文件到 MinIO (如果可用)
        if self.minio_available and self.minio_client:
            storage_path = await self._get_storage_path(collection_id, filename)
            try:
                self.minio_client.put_object(
                    bucket_name=settings.MINIO_BUCKET,
                    object_name=storage_path,
                    data=__import__("io").BytesIO(file_content),
                    length=len(file_content),
                    content_type=file_type,
                )
            except Exception as e:
                logger.warning(f"MinIO 存储失败 (使用本地路径): {e}")
                storage_path = f"local/{collection_id}/{filename}"
        else:
            storage_path = f"local/{collection_id}/{filename}"

        # 创建文档记录
        document = Document(
            collection_id=collection_id,
            filename=filename,
            file_path=storage_path,
            file_type=file_type,
            file_size=len(file_content),
            status="pending",
            uploader_id=uploader_id,
        )

        db.add(document)
        await db.flush()
        await db.refresh(document)

        return document
```

- [ ] **Step 3: 修改上传路由注入 uploader 信息到 metadata**

打开 `backend/app/api/documents.py`，定位第 61-67 行调用 `document_service.upload_document(...)` 的代码块，在该行后追加一段 SQL 查询 username 与 tags，再把 uploader_id / uploader_username / tag_ids / tag_names 注入 metadata。

将整个 if-block（第 81-111 行）替换为：

```python
        if collection:
            # 保存到临时文件并索引
            import tempfile
            ext = os.path.splitext(file.filename)[1]
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(file_content)
                tmp_path = tmp.name

            try:
                rag_engine = get_rag_engine()

                # 取出当前 KB 的标签（写入时快照到 Qdrant payload）
                from app.models.document import Tag, CollectionTag
                tag_rows = await db.execute(
                    select(Tag)
                    .join(CollectionTag, Tag.id == CollectionTag.tag_id)
                    .where(CollectionTag.collection_id == collection_id)
                )
                tag_objs = list(tag_rows.scalars().all())
                tag_ids = [t.id for t in tag_objs]
                tag_names = [t.name for t in tag_objs]

                chunk_count = await rag_engine.index_document(
                    file_path=tmp_path,
                    collection_name=collection.qdrant_collection,
                    metadata={
                        "filename": file.filename,
                        "file_type": get_file_type(file.filename),
                        "collection_id": collection_id,
                        "document_id": document.id,
                        "uploader_id": current_user.id or "",
                        "uploader_username": current_user.username or "",
                        "tag_ids": tag_ids,
                        "tag_names": tag_names,
                    },
                )

                # 更新文档状态
                document.status = "indexed"
                document.chunk_count = chunk_count
                await db.flush()

                logger.info(
                    f"文档索引完成: {file.filename}, {chunk_count} 个块"
                )
            finally:
                os.unlink(tmp_path)
```

并在 `document_service.upload_document` 调用处（约第 61-67 行）改为：

```python
    document = await document_service.upload_document(
        collection_id=collection_id,
        filename=file.filename,
        file_content=file_content,
        file_type=get_file_type(file.filename),
        uploader_id=current_user.id,
        db=db,
    )
```

- [ ] **Step 4: 跑导入验证**

```bash
cd backend && .venv/Scripts/python -c "
from app.rag.engine import RAGEngine
from app.services.document_service import DocumentService
from app.api.documents import router
print('OK')
"
```

预期输出：`OK`。

- [ ] **Step 5: 提交**

```bash
git add backend/app/rag/engine.py backend/app/services/document_service.py backend/app/api/documents.py
git commit -m "feat(rag): snapshot uploader/tags/collection into Qdrant payload + persist Document.uploader_id"
```

---

## Task 6: `RAGEngine.search()` 返回 `highlight_terms`

**Files:**
- Modify: `backend/app/rag/engine.py:234-279`（`search` 方法）
- Modify: `backend/app/services/chat_service.py:289-321`（`search` 方法）

- [ ] **Step 1: 修改 `engine.py` 中 `search` 方法返回结构**

打开 `backend/app/rag/engine.py`，定位第 234-279 行 `search` 方法，将整个方法替换为：

```python
    async def search(
        self,
        query: str,
        collection_name: str,
        top_k: int = 10,
        filter_condition: Optional[dict] = None,
        use_reranker: bool = True,
        hybrid: bool = True,
    ) -> dict:
        """搜索知识库，返回 {results, highlight_terms}。

        highlight_terms 来自 BM25 命中片段中的 query 关键词，供前端高亮。
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

        # 4. 提取高亮命中词（基于最终 results）
        highlight_terms = retriever.get_query_highlight_terms(
            query_text=query,
            top_results=results,
            max_terms=8,
        )

        return {"results": results, "highlight_terms": highlight_terms}
```

- [ ] **Step 2: 同步修改 `chat_service.search` 适配新返回值**

打开 `backend/app/services/chat_service.py`，定位第 289-321 行 `search` 方法，将整个方法替换为：

```python
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
```

- [ ] **Step 3: 跑导入验证**

```bash
cd backend && .venv/Scripts/python -c "
from app.services.chat_service import ChatService
svc = ChatService()
print(hasattr(svc, 'search'), hasattr(svc, '_build_filter_condition'))
"
```

预期输出：`True True`。

- [ ] **Step 4: 提交**

```bash
git add backend/app/rag/engine.py backend/app/services/chat_service.py
git commit -m "feat(rag): engine.search returns highlight_terms; chat_service.search wires filters"
```

---

## Task 7: `ChatService.chat/chat_stream` 透传 filters 与 highlight_terms

**Files:**
- Modify: `backend/app/services/chat_service.py:107-282`（chat 与 chat_stream 方法）

- [ ] **Step 1: 修改 `chat` 方法签名与实现**

定位第 107-167 行 `chat` 方法，将整个方法替换为：

```python
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
```

- [ ] **Step 2: 修改 `chat_stream` 方法签名与实现**

定位第 169-282 行 `chat_stream` 方法，将整个方法替换为：

```python
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
```

- [ ] **Step 3: 跑导入验证**

```bash
cd backend && .venv/Scripts/python -c "
from app.services.chat_service import ChatService
import inspect
sig = inspect.signature(ChatService.chat_stream)
assert 'filters' in sig.parameters
print('OK')
"
```

预期输出：`OK`。

- [ ] **Step 4: 提交**

```bash
git add backend/app/services/chat_service.py
git commit -m "feat(chat): chat/chat_stream accept filters + propagate highlight_terms to SSE sources"
```

---

## Task 8: `POST /api/v1/search` 扩展接受 filters；新增 `GET /api/v1/search/facets`

**Files:**
- Modify: `backend/app/api/search.py:1-57`

- [ ] **Step 1: 重写 `search.py`**

打开 `backend/app/api/search.py`，用以下内容**完全替换**该文件：

```python
"""语义搜索 API"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_current_user
from app.auth.permissions import require_collection_role
from app.models.database import get_db
from app.models.document import User
from app.schemas.chat import SearchRequest, SearchResponse, SearchFacetsResponse
from app.services.chat_service import ChatService

router = APIRouter(prefix="/api/v1/search", tags=["语义搜索"])
chat_service = ChatService()


@router.post("", response_model=SearchResponse)
async def search(
    req: Request,
    request: SearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """语义搜索知识库（需要 viewer+）"""
    # viewer 权限检查
    req.path_params["collection_id"] = request.collection_id
    await require_collection_role(
        req, min_role="viewer", db=db, current_user=current_user
    )

    # 把 Pydantic model 转成 dict（向后兼容：None 字段也保留）
    filters = (
        request.filters.model_dump(exclude_none=True)
        if request.filters is not None
        else None
    )

    try:
        result = await chat_service.search(
            query=request.query,
            collection_id=request.collection_id,
            top_k=request.top_k,
            use_reranker=request.use_reranker,
            filters=filters,
            db=db,
        )

        return SearchResponse(
            query=result["query"],
            results=result["results"],
            total=result["total"],
            applied_filters=request.filters,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"搜索失败: {str(e)}",
        )


@router.get("/facets", response_model=SearchFacetsResponse)
async def search_facets(
    req: Request,
    collection_id: str = Query(..., description="知识库 UUID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取知识库的可选筛选维度（需要 viewer+）

    一次 SQL 联查，按 collection_id 范围返回：
    - uploaders: 当前 KB 中所有上传者（id / username / 文档数）
    - tags: 当前 KB 关联的所有标签
    - file_types: 当前 KB 中出现过的文件类型
    """
    # viewer 权限检查
    req.path_params["collection_id"] = collection_id
    await require_collection_role(
        req, min_role="viewer", db=db, current_user=current_user
    )

    try:
        result = await chat_service.get_search_facets(collection_id, db)
        return SearchFacetsResponse(
            uploaders=result["uploaders"],
            tags=result["tags"],
            file_types=result["file_types"],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取 facets 失败: {str(e)}")
```

- [ ] **Step 2: 在 `ChatService` 中新增 `get_search_facets` 方法**

打开 `backend/app/services/chat_service.py`，定位 `search` 方法（第 289 行附近）**之前**，插入：

```python
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
```

- [ ] **Step 3: 跑导入验证**

```bash
cd backend && .venv/Scripts/python -c "
from app.api.search import router
from app.services.chat_service import ChatService
print(hasattr(ChatService, 'get_search_facets'))
print([r.path for r in router.routes])
"
```

预期输出第二行包含：`/api/v1/search/facets`。

- [ ] **Step 4: 提交**

```bash
git add backend/app/api/search.py backend/app/services/chat_service.py
git commit -m "feat(api): /search accepts filters; add GET /search/facets endpoint"
```

---

## Task 9: 问答 API 端点透传 filters

**Files:**
- Modify: `backend/app/api/chat.py:35-120`

- [ ] **Step 1: 修改 `chat` 路由透传 filters**

打开 `backend/app/api/chat.py`，定位第 49-58 行 `chat_service.chat(...)` 调用，将整段替换为：

```python
    try:
        # Pydantic filters → dict（None 字段排除）
        filters = (
            request.filters.model_dump(exclude_none=True)
            if request.filters is not None
            else None
        )
        result = await chat_service.chat(
            query=request.query,
            collection_id=request.collection_id,
            conversation_id=request.conversation_id,
            user_id=current_user.id,
            top_k=request.top_k,
            use_reranker=request.use_reranker,
            filters=filters,
            db=db,
        )

        return ChatResponse(
            answer=result["answer"],
            sources=result.get("sources", []),
            conversation_id=result["conversation_id"],
        )
```

- [ ] **Step 2: 修改 `chat_stream` 路由透传 filters**

定位第 92-110 行 `event_generator()` 内的 `chat_service.chat_stream(...)` 调用，**先**在该行**之前**计算 `filters`：

```python
    async def event_generator():
        try:
            filters = (
                request.filters.model_dump(exclude_none=True)
                if request.filters is not None
                else None
            )
            async for event in chat_service.chat_stream(
                query=request.query,
                collection_id=request.collection_id,
                conversation_id=request.conversation_id,
                user_id=current_user.id,
                top_k=request.top_k,
                use_reranker=request.use_reranker,
                filters=filters,
                db=db,
            ):
                yield event
```

- [ ] **Step 3: 跑导入验证**

```bash
cd backend && .venv/Scripts/python -c "
from app.api.chat import router
from app.schemas.chat import ChatRequest, SearchFilters
req = ChatRequest(query='x', collection_id='c', filters=SearchFilters(file_types=['pdf']))
print(req.model_dump())
"
```

预期输出含 `filters: {'file_types': ['pdf']}`。

- [ ] **Step 4: 提交**

```bash
git add backend/app/api/chat.py
git commit -m "feat(api): chat + chat_stream routes accept filters"
```

---

## Task 10: 端到端测试（filters + facets + highlight）

**Files:**
- Create: `backend/tests/test_search_filters.py`

- [ ] **Step 1: 写失败测试**

新建 `backend/tests/test_search_filters.py`：

```python
"""端到端测试：高级搜索过滤 + facets + highlight。

需要本地 PostgreSQL（与 conftest.py 一致）+ 已运行 v6 迁移。
"""

from __future__ import annotations

import pytest

from app.models.acl import CollectionACL


def _create_collection(db, name: str = "kb-test", owner=None):
    from app.models.document import Collection
    c = Collection(
        name=name,
        qdrant_collection=f"kb_{name.lower().replace(' ', '_')}",
        owner_id=owner.id if owner else None,
    )
    db.add(c)
    await db_flush(db)
    return c


async def db_flush(db):
    from sqlalchemy import text
    await db.flush()
    await db.commit()


@pytest.fixture
async def collection_with_docs(db, alice, bob):
    """构造：1 个 KB，2 个上传者（alice / bob），2 个文档。"""
    from app.models.document import Collection, Document
    c = Collection(
        name="kb-test",
        qdrant_collection="kb_kbtest",
        owner_id=alice.id,
    )
    db.add(c)
    await db_flush(db)
    await db.refresh(c)

    # 给 alice / bob 授权 viewer
    for u in (alice, bob):
        db.add(CollectionACL(collection_id=c.id, user_id=u.id, role="viewer"))
    await db_flush(db)

    d1 = Document(
        collection_id=c.id, filename="运维手册.pdf", file_path="x.pdf",
        file_type="pdf", chunk_count=1, status="indexed", uploader_id=alice.id,
    )
    d2 = Document(
        collection_id=c.id, filename="监控指南.md", file_path="y.md",
        file_type="md", chunk_count=1, status="indexed", uploader_id=bob.id,
    )
    db.add_all([d1, d2])
    await db_flush(db)
    return c, d1, d2


@pytest.mark.asyncio
async def test_search_filters_schema_accepts_optional(client):
    """filters 字段为 None 时不能 422。"""
    token_resp = await client.post(
        "/api/v1/auth/login", json={"username": "alice", "password": "password"}
    )
    token = token_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 任意 collection_id 都能校验 schema（权限失败是另一回事）
    resp = await client.post(
        "/api/v1/search",
        headers=headers,
        json={"query": "x", "collection_id": "00000000-0000-0000-0000-000000000000"},
    )
    # 期望非 422（可能是 403/404/500，但 schema 通过）
    assert resp.status_code != 422, resp.text


@pytest.mark.asyncio
async def test_search_filters_with_payload_passes_schema(client):
    """filters 完整字段时 schema 通过。"""
    token_resp = await client.post(
        "/api/v1/auth/login", json={"username": "alice", "password": "password"}
    )
    token = token_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.post(
        "/api/v1/search",
        headers=headers,
        json={
            "query": "x",
            "collection_id": "00000000-0000-0000-0000-000000000000",
            "filters": {
                "file_types": ["pdf"],
                "uploader_ids": ["u1"],
                "tag_ids": ["t1"],
                "filename_contains": "运维",
            },
        },
    )
    assert resp.status_code != 422, resp.text


@pytest.mark.asyncio
async def test_facets_endpoint_returns_structure(client, collection_with_docs, alice):
    """GET /search/facets 返回三类 FacetOption。"""
    token_resp = await client.post(
        "/api/v1/auth/login", json={"username": "alice", "password": "password"}
    )
    token = token_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    c, _, _ = collection_with_docs
    resp = await client.get(
        f"/api/v1/search/facets?collection_id={c.id}",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert set(data.keys()) == {"uploaders", "tags", "file_types"}
    assert isinstance(data["uploaders"], list)
    assert isinstance(data["tags"], list)
    assert isinstance(data["file_types"], list)


@pytest.mark.asyncio
async def test_facets_count_uploader_documents(client, collection_with_docs, alice):
    """uploaders 计数：alice 1 篇、bob 1 篇。"""
    token_resp = await client.post(
        "/api/v1/auth/login", json={"username": "alice", "password": "password"}
    )
    token = token_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    c, _, _ = collection_with_docs
    resp = await client.get(
        f"/api/v1/search/facets?collection_id={c.id}",
        headers=headers,
    )
    data = resp.json()
    counts = {u["label"]: u["count"] for u in data["uploaders"]}
    assert counts.get("alice") == 1
    assert counts.get("bob") == 1
```

- [ ] **Step 2: 跑测试确认通过**

```bash
cd backend && .venv/Scripts/python -m pytest tests/test_search_filters.py -v
```

预期：所有用例 PASS。

如果 conftest 没有建 `CollectionACL` 表导致外键报错，先确认 `app/models/__init__.py` 或 conftest 已经 import 了 `app.models.acl`（已知 conftest.py 第 38 行已 import `from app.models import acl as _acl_models`，无需修改）。

- [ ] **Step 3: 跑全部测试确认无回归**

```bash
cd backend && .venv/Scripts/python -m pytest -v --tb=short
```

预期：原有 + 新增测试全部通过。

- [ ] **Step 4: 提交**

```bash
git add backend/tests/test_search_filters.py
git commit -m "test: add e2e tests for /search filters and /search/facets"
```

---

## Task 11: 前端类型扩展 + API 客户端扩展

**Files:**
- Modify: `frontend/src/types/index.ts:81-128`
- Modify: `frontend/src/lib/api.ts:1-37`（import）+ `search()` 方法 + 新增 `getSearchFacets()`

- [ ] **Step 1: 扩展前端类型**

打开 `frontend/src/types/index.ts`，定位第 81-86 行 `SourceItem`，**整个替换**为：

```typescript
export interface SourceItem {
  index: number;
  source: string;
  text: string;
  score: number;
  file_type?: string | null;
  uploader_username?: string | null;
  document_id?: string | null;
  tag_ids?: string[];
  highlight_terms?: string[];
}
```

将第 88-94 行 `ChatRequest` **整个替换**为：

```typescript
export interface ChatRequest {
  query: string;
  collection_id: string;
  conversation_id?: string;
  top_k?: number;
  use_reranker?: boolean;
  filters?: SearchFilters;
}
```

将第 102-107 行 `SearchRequest` **整个替换**为：

```typescript
export interface SearchRequest {
  query: string;
  collection_id: string;
  top_k?: number;
  use_reranker?: boolean;
  filters?: SearchFilters;
}
```

将第 109-114 行 `SearchResult` **整个替换**为：

```typescript
export interface SearchResult {
  index: number;
  source: string;
  text: string;
  score: number;
  file_type?: string | null;
  uploader_username?: string | null;
  document_id?: string | null;
  tag_ids?: string[];
  highlight_terms?: string[];
}
```

将第 116-120 行 `SearchResponse` **整个替换**为：

```typescript
export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
  applied_filters?: SearchFilters | null;
}
```

在 `SourceItem` **之前**（第 81 行上方），插入以下类型：

```typescript
// ===== 高级搜索过滤 =====

export interface SearchFilters {
  file_types?: string[];
  uploader_ids?: string[];
  tag_ids?: string[];
  filename_contains?: string;
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export interface SearchFacetsResponse {
  uploaders: FacetOption[];
  tags: FacetOption[];
  file_types: FacetOption[];
}
```

- [ ] **Step 2: 扩展 `api.ts` 客户端**

打开 `frontend/src/lib/api.ts`，定位第 2-37 行的 import 块，在末尾追加：

```typescript
  SearchFacetsResponse,
```

定位第 307-312 行 `search()` 方法，**整个替换**为：

```typescript
  // 搜索
  async search(request: SearchRequest): Promise<SearchResponse> {
    return this.request<SearchResponse>("/api/v1/search", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  // 获取搜索筛选面板的可选维度
  async getSearchFacets(collectionId: string): Promise<SearchFacetsResponse> {
    return this.request<SearchFacetsResponse>(
      `/api/v1/search/facets?collection_id=${encodeURIComponent(collectionId)}`,
    );
  }
```

- [ ] **Step 3: TS 编译验证**

```bash
cd frontend && npx tsc --noEmit
```

预期：无错误输出。

- [ ] **Step 4: ESLint 验证**

```bash
cd frontend && npx eslint src/types/index.ts src/lib/api.ts
```

预期：无 error 输出（warning 可接受）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/types/index.ts frontend/src/lib/api.ts
git commit -m "feat(frontend): extend types (SearchFilters/FacetOption) + api.getSearchFacets"
```

---

## Task 12: `HighlightedText` 组件

**Files:**
- Create: `frontend/src/components/HighlightedText.tsx`

- [ ] **Step 1: 写组件**

新建 `frontend/src/components/HighlightedText.tsx`：

```tsx
"use client";

import { useMemo } from "react";

interface HighlightedTextProps {
  text: string;
  /** BM25 命中词（大小写不敏感） */
  terms: string[];
  /** 高亮样式（默认琥珀色背景） */
  highlightClassName?: string;
  /** 是否大小写敏感，默认 false */
  caseSensitive?: boolean;
}

interface Span {
  start: number;
  end: number;
}

/**
 * 在文本中找所有命中区间（子串匹配），合并重叠区间，再用 React 切片渲染。
 *
 * 设计要点：
 * - 不用 dangerouslySetInnerHTML，避免 XSS
 * - 区间合并：避免嵌套 <mark>
 * - terms 中空字符串 / 长度 < 2 会被过滤
 */
export default function HighlightedText({
  text,
  terms,
  highlightClassName = "bg-amber-200 text-slate-900 rounded px-0.5",
  caseSensitive = false,
}: HighlightedTextProps) {
  const segments = useMemo(() => {
    const validTerms = (terms || [])
      .map((t) => (t || "").trim())
      .filter((t) => t.length >= 2);
    if (validTerms.length === 0 || !text) {
      return [{ key: "0", text, mark: false }];
    }

    const haystack = caseSensitive ? text : text.toLowerCase();
    const spans: Span[] = [];
    for (const term of validTerms) {
      const needle = caseSensitive ? term : term.toLowerCase();
      if (!needle) continue;
      let from = 0;
      while (from < haystack.length) {
        const idx = haystack.indexOf(needle, from);
        if (idx === -1) break;
        spans.push({ start: idx, end: idx + needle.length });
        from = idx + needle.length;
      }
    }

    if (spans.length === 0) {
      return [{ key: "0", text, mark: false }];
    }

    // 区间合并：按 start 排序，扫描时合并重叠 / 相邻区间
    spans.sort((a, b) => a.start - b.start || a.end - b.end);
    const merged: Span[] = [spans[0]];
    for (let i = 1; i < spans.length; i++) {
      const last = merged[merged.length - 1];
      const cur = spans[i];
      if (cur.start <= last.end) {
        last.end = Math.max(last.end, cur.end);
      } else {
        merged.push({ ...cur });
      }
    }

    // 切片
    const result: { key: string; text: string; mark: boolean }[] = [];
    let cursor = 0;
    merged.forEach((span, i) => {
      if (span.start > cursor) {
        result.push({ key: `p-${i}`, text: text.slice(cursor, span.start), mark: false });
      }
      result.push({
        key: `m-${i}`,
        text: text.slice(span.start, span.end),
        mark: true,
      });
      cursor = span.end;
    });
    if (cursor < text.length) {
      result.push({ key: "tail", text: text.slice(cursor), mark: false });
    }
    return result;
  }, [text, terms, caseSensitive]);

  return (
    <>
      {segments.map((seg) =>
        seg.mark ? (
          <mark key={seg.key} className={highlightClassName}>
            {seg.text}
          </mark>
        ) : (
          <span key={seg.key}>{seg.text}</span>
        ),
      )}
    </>
  );
}
```

- [ ] **Step 2: TS 编译验证**

```bash
cd frontend && npx tsc --noEmit
```

预期：无错误。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/HighlightedText.tsx
git commit -m "feat(frontend): add HighlightedText component with interval merging"
```

---

## Task 13: `AdvancedFilterPanel` 组件（createPortal 抽屉）

**Files:**
- Create: `frontend/src/components/AdvancedFilterPanel.tsx`

- [ ] **Step 1: 写组件**

新建 `frontend/src/components/AdvancedFilterPanel.tsx`：

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, FileText, User, Tag as TagIcon, Type, ChevronDown, Check, Filter } from "lucide-react";
import type { SearchFilters, SearchFacetsResponse, FacetOption } from "@/types";

interface Props {
  open: boolean;
  facets: SearchFacetsResponse | null;
  /** 当前"编辑中"的筛选条件（用于抽屉内 checkbox / 多选下拉的初始值） */
  initialFilters: SearchFilters;
  /** 已应用筛选数量（用于标题旁徽章） */
  appliedCount: number;
  onApply: (filters: SearchFilters) => void;
  onClose: () => void;
}

const FILE_TYPE_LABEL: Record<string, string> = {
  pdf: "PDF",
  docx: "Word",
  doc: "Word",
  md: "Markdown",
  txt: "Text",
  xlsx: "Excel",
  xls: "Excel",
  pptx: "PowerPoint",
  ppt: "PowerPoint",
  html: "HTML",
  csv: "CSV",
};

export default function AdvancedFilterPanel({
  open,
  facets,
  initialFilters,
  appliedCount,
  onApply,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<SearchFilters>(initialFilters);
  const [mounted, setMounted] = useState(false);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);

  // 打开时把 initialFilters 拷贝到 draft
  useEffect(() => {
    if (open) setDraft(initialFilters);
  }, [open, initialFilters]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 打开时锁定 body 滚动
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open || !mounted) return null;

  const toggleFileType = (v: string) => {
    const cur = draft.file_types || [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    setDraft({ ...draft, file_types: next.length ? next : undefined });
  };

  const toggleId = (key: "uploader_ids" | "tag_ids", v: string) => {
    const cur = (draft[key] || []) as string[];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    setDraft({ ...draft, [key]: next.length ? next : undefined });
  };

  const handleClear = () => {
    setDraft({});
  };

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  const draftCount =
    (draft.file_types?.length || 0) +
    (draft.uploader_ids?.length || 0) +
    (draft.tag_ids?.length || 0) +
    (draft.filename_contains ? 1 : 0);

  const fileTypeOptions: FacetOption[] = facets?.file_types || [];
  const uploaderOptions: FacetOption[] = facets?.uploaders || [];
  const tagOptions: FacetOption[] = facets?.tags || [];

  return createPortal(
    <div
      className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-[1px] flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-[380px] max-w-[92vw] h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-600" />
            <h2 className="text-sm font-semibold text-slate-900">高级筛选</h2>
            {appliedCount > 0 && (
              <span className="text-[11px] font-medium text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">
                已应用 {appliedCount} 项
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* 文件类型 */}
          <section>
            <div className="flex items-center gap-1.5 mb-2.5">
              <FileText className="h-3.5 w-3.5 text-slate-500" />
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">文件类型</h3>
            </div>
            {fileTypeOptions.length === 0 ? (
              <p className="text-xs text-slate-400">暂无选项</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {fileTypeOptions.map((opt) => {
                  const checked = draft.file_types?.includes(opt.value) || false;
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs cursor-pointer transition-all ${
                        checked
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => toggleFileType(opt.value)}
                      />
                      <Check
                        className={`h-3 w-3 ${checked ? "opacity-100" : "opacity-0"}`}
                      />
                      <span>{FILE_TYPE_LABEL[opt.value] || opt.label}</span>
                      <span className="text-slate-400">({opt.count})</span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          {/* 上传者 */}
          <section>
            <div className="flex items-center gap-1.5 mb-2.5">
              <User className="h-3.5 w-3.5 text-slate-500" />
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">上传者</h3>
            </div>
            {uploaderOptions.length === 0 ? (
              <p className="text-xs text-slate-400">暂无选项</p>
            ) : (
              <MultiSelectDropdown
                options={uploaderOptions}
                selected={draft.uploader_ids || []}
                onToggle={(v) => toggleId("uploader_ids", v)}
                open={uploaderOpen}
                setOpen={setUploaderOpen}
                placeholder="选择上传者..."
              />
            )}
          </section>

          {/* 知识库标签 */}
          <section>
            <div className="flex items-center gap-1.5 mb-2.5">
              <TagIcon className="h-3.5 w-3.5 text-slate-500" />
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">知识库标签</h3>
            </div>
            {tagOptions.length === 0 ? (
              <p className="text-xs text-slate-400">暂无选项</p>
            ) : (
              <MultiSelectDropdown
                options={tagOptions}
                selected={draft.tag_ids || []}
                onToggle={(v) => toggleId("tag_ids", v)}
                open={tagOpen}
                setOpen={setTagOpen}
                placeholder="选择标签..."
              />
            )}
          </section>

          {/* 文件名包含 */}
          <section>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Type className="h-3.5 w-3.5 text-slate-500" />
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">文件名包含</h3>
            </div>
            <input
              type="text"
              value={draft.filename_contains || ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  filename_contains: e.target.value.trim() || undefined,
                })
              }
              placeholder="输入关键字，如 监控"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 focus:bg-white outline-none"
            />
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={handleClear}
            disabled={draftCount === 0}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            清空
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={draftCount === 0}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            应用筛选 {draftCount > 0 && `(${draftCount})`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ===== 内嵌子组件：多选下拉 ===== */

interface MultiSelectProps {
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  placeholder: string;
}

function MultiSelectDropdown({
  options,
  selected,
  onToggle,
  open,
  setOpen,
  placeholder,
}: MultiSelectProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, setOpen]);

  const labels = options
    .filter((o) => selected.includes(o.value))
    .map((o) => o.label)
    .join("、");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:border-slate-300"
      >
        <span className={selected.length === 0 ? "text-slate-400" : "truncate"}>
          {selected.length === 0 ? placeholder : labels}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-60 overflow-y-auto">
          {options.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                  checked={checked}
                  onChange={() => onToggle(opt.value)}
                />
                <span className="flex-1 truncate text-slate-700">{opt.label}</span>
                <span className="text-xs text-slate-400">{opt.count}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TS + ESLint 验证**

```bash
cd frontend && npx tsc --noEmit && npx eslint src/components/AdvancedFilterPanel.tsx
```

预期：tsc 无错误，eslint 仅允许 warning。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/AdvancedFilterPanel.tsx
git commit -m "feat(frontend): add AdvancedFilterPanel (createPortal drawer) with file_type/uploader/tag/filename"
```

---

## Task 14: `SearchBox` 接入 filters + 抽屉按钮 + facet 加载

**Files:**
- Modify: `frontend/src/components/SearchBox.tsx:1-156`

- [ ] **Step 1: 在 SearchBox 顶部新增 import**

打开 `frontend/src/components/SearchBox.tsx`，定位第 1-7 行 import 块，**整个替换**为：

```tsx
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Collection, SearchFacetsResponse, SearchFilters, SearchResult } from "@/types";
import SourceCard from "./SourceCard";
import AdvancedFilterPanel from "./AdvancedFilterPanel";
import { Search, Database, Sparkles, FileSearch, SlidersHorizontal, X } from "lucide-react";
```

- [ ] **Step 2: 替换 SearchBox 组件主体**

定位第 13-155 行 `SearchBox` 组件，**整个替换**为：

```tsx
export default function SearchBox({ collections }: Props) {
  const [query, setQuery] = useState("");
  const [selectedCollection, setSelectedCollection] = useState("");
  const [useReranker, setUseReranker] = useState(true);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // 筛选：编辑中 / 已应用 两套状态
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [facets, setFacets] = useState<SearchFacetsResponse | null>(null);
  const [facetsLoading, setFacetsLoading] = useState(false);

  // 切换 KB 时加载 facet（按 collection_id 缓存到 localStorage 5 分钟）
  useEffect(() => {
    if (!selectedCollection) {
      setFacets(null);
      return;
    }
    const cacheKey = `search_facets_${selectedCollection}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { ts, data } = JSON.parse(cached);
        if (Date.now() - ts < 5 * 60 * 1000) {
          setFacets(data);
          return;
        }
      }
    } catch {
      // localStorage 解析失败忽略
    }

    let cancelled = false;
    setFacetsLoading(true);
    api
      .getSearchFacets(selectedCollection)
      .then((data) => {
        if (cancelled) return;
        setFacets(data);
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
        } catch {
          // quota 等忽略
        }
      })
      .catch((err) => {
        console.error("facets load failed:", err);
        if (cancelled) return;
        setFacets({ uploaders: [], tags: [], file_types: [] });
      })
      .finally(() => {
        if (cancelled) return;
        setFacetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCollection]);

  const handleSearch = async () => {
    if (!query.trim() || !selectedCollection) return;

    setLoading(true);
    setSearched(true);
    try {
      const response = await api.search({
        query: query.trim(),
        collection_id: selectedCollection,
        use_reranker: useReranker,
        filters: appliedFilters,
      });
      setResults(response.results);
    } catch (err) {
      console.error("Search error:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  const appliedCount =
    (appliedFilters.file_types?.length || 0) +
    (appliedFilters.uploader_ids?.length || 0) +
    (appliedFilters.tag_ids?.length || 0) +
    (appliedFilters.filename_contains ? 1 : 0);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 搜索控制区 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Database className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <select
              value={selectedCollection}
              onChange={(e) => setSelectedCollection(e.target.value)}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 py-2.5 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 focus:bg-white outline-none transition-all"
            >
              <option value="">选择知识库...</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={useReranker}
              onChange={(e) => setUseReranker(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            重排序
          </label>
          {/* 高级筛选按钮 */}
          <button
            onClick={() => setDrawerOpen(true)}
            disabled={!selectedCollection}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
              appliedCount > 0
                ? "border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            高级
            {appliedCount > 0 && (
              <span className="text-[11px] font-semibold">{appliedCount}</span>
            )}
          </button>
        </div>

        {/* 搜索框 */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedCollection ? "输入搜索关键词..." : "请先选择知识库"}
              disabled={!selectedCollection || loading}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 py-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 focus:bg-white outline-none transition-all disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={!query.trim() || !selectedCollection || loading}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 transition-all"
          >
            <Search className="h-4 w-4" />
            {loading ? "搜索中..." : "搜索"}
          </button>
        </div>

        {/* 已应用筛选摘要 */}
        {appliedCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="text-slate-400">已应用筛选：</span>
            {(appliedFilters.file_types || []).map((ft) => (
              <span key={`ft-${ft}`} className="rounded-full bg-slate-100 px-2 py-0.5">{ft}</span>
            ))}
            {(appliedFilters.uploader_ids || []).map((id) => {
              const label = facets?.uploaders.find((u) => u.value === id)?.label || id;
              return (
                <span key={`u-${id}`} className="rounded-full bg-slate-100 px-2 py-0.5">@{label}</span>
              );
            })}
            {(appliedFilters.tag_ids || []).map((id) => {
              const label = facets?.tags.find((t) => t.value === id)?.label || id;
              return (
                <span key={`t-${id}`} className="rounded-full bg-slate-100 px-2 py-0.5">#{label}</span>
              );
            })}
            {appliedFilters.filename_contains && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5">包含 "{appliedFilters.filename_contains}"</span>
            )}
            <button
              onClick={() => setAppliedFilters({})}
              className="ml-1 flex items-center gap-0.5 text-slate-400 hover:text-slate-700"
            >
              <X className="h-3 w-3" />
              清空
            </button>
          </div>
        )}
      </div>

      {/* 搜索结果 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative mb-3">
              <div className="h-10 w-10 rounded-full border-4 border-slate-200" />
              <div className="absolute inset-0 h-10 w-10 animate-spin rounded-full border-4 border-transparent border-t-blue-600" />
            </div>
            <p className="text-sm text-slate-500">正在检索...</p>
          </div>
        ) : searched ? (
          results.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 mb-3">
                <FileSearch className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700">未找到相关结果</p>
              <p className="mt-1 text-xs text-slate-400">尝试使用不同的关键词或调整筛选条件</p>
            </div>
          ) : (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center gap-2 px-1">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <p className="text-sm text-slate-600">
                  找到 <span className="font-semibold text-slate-900">{results.length}</span> 个相关结果
                </p>
              </div>
              {results.map((result, i) => (
                <SourceCard
                  key={i}
                  source={{
                    index: result.index,
                    source: result.source,
                    text: result.text,
                    score: result.score,
                    file_type: result.file_type,
                    uploader_username: result.uploader_username,
                    highlight_terms: result.highlight_terms ?? [],
                  }}
                />
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 mb-4">
              <Search className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-600">输入搜索词开始检索</p>
            <p className="mt-1 text-xs text-slate-400">基于向量相似度匹配知识库中的文档片段</p>
            {facetsLoading && (
              <p className="mt-3 text-xs text-slate-400">加载可选筛选维度...</p>
            )}
          </div>
        )}
      </div>

      {/* 抽屉式高级筛选 */}
      <AdvancedFilterPanel
        open={drawerOpen}
        facets={facets}
        initialFilters={appliedFilters}
        appliedCount={appliedCount}
        onApply={(next) => setAppliedFilters(next)}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: TS + ESLint 验证**

```bash
cd frontend && npx tsc --noEmit && npx eslint src/components/SearchBox.tsx
```

预期：tsc 无错误；eslint 仅允许 warning。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/SearchBox.tsx
git commit -m "feat(frontend): SearchBox integrates filters + drawer + facet loading + cache"
```

---

## Task 15: `SourceCard` 替换纯文本为 HighlightedText + 头部 file_type / uploader 信息

**Files:**
- Modify: `frontend/src/components/SourceCard.tsx:1-80`

- [ ] **Step 1: 替换 import**

打开 `frontend/src/components/SourceCard.tsx`，定位第 1-5 行，**整个替换**为：

```tsx
"use client";

import { useState } from "react";
import type { SourceItem } from "@/types";
import HighlightedText from "./HighlightedText";
import { FileText, ChevronDown, ChevronUp, FileType, User } from "lucide-react";
```

- [ ] **Step 2: 替换头部信息渲染（增加 file_type / uploader_username 徽章）**

定位第 30-56 行的 JSX 头部块，**整个替换**为：

```tsx
      <div className="p-4">
        {/* 头部信息 */}
        <div className="flex items-center gap-3 mb-2.5">
          <span className="inline-flex items-center justify-center h-6 min-w-[24px] rounded-md bg-slate-100 px-1.5 text-xs font-bold text-slate-600">
            #{source.index + 1}
          </span>
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="text-xs font-medium text-slate-600 truncate">
              {source.source}
            </span>
            {source.file_type && (
              <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 uppercase">
                <FileType className="h-2.5 w-2.5" />
                {source.file_type}
              </span>
            )}
            {source.uploader_username && (
              <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                <User className="h-2.5 w-2.5" />
                {source.uploader_username}
              </span>
            )}
          </div>
          {/* 相关度 */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${getScoreColor(source.score)} transition-all`}
                style={{ width: `${scorePercent}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-slate-500 tabular-nums">
              {scorePercent}%
            </span>
          </div>
        </div>

        {/* 文本内容（高亮命中词） */}
        <div className="relative">
          <p className={`text-sm text-slate-700 leading-relaxed ${expanded ? "" : "line-clamp-3"}`}>
            <HighlightedText
              text={source.text}
              terms={source.highlight_terms || []}
            />
          </p>
          {source.text.length > 150 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              {expanded ? (
                <>收起 <ChevronUp className="h-3 w-3" /></>
              ) : (
                <>展开全部 <ChevronDown className="h-3 w-3" /></>
              )}
            </button>
          )}
        </div>
      </div>
```

- [ ] **Step 3: TS + ESLint 验证**

```bash
cd frontend && npx tsc --noEmit && npx eslint src/components/SourceCard.tsx
```

预期：tsc 无错误。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/components/SourceCard.tsx
git commit -m "feat(frontend): SourceCard uses HighlightedText + shows file_type/uploader badges"
```

---

## Task 16: `ChatBox` 回答正文用 HighlightedText + 把 filters 传给 chatStream

**Files:**
- Modify: `frontend/src/components/ChatBox.tsx:102-225`（handleSend + handleKeyDown）

- [ ] **Step 1: 在顶部 import 区追加 `HighlightedText` 与类型**

打开 `frontend/src/components/ChatBox.tsx`，定位第 1-24 行 import 块，在末尾追加：

```tsx
import HighlightedText from "./HighlightedText";
import type { SearchFilters } from "@/types";
```

- [ ] **Step 2: 修改 `handleSend` 接受并传入 filters**

定位第 102-214 行 `handleSend` 函数签名，将整个 useCallback 替换为：

```tsx
  const handleSend = useCallback(async () => {
    if (!input.trim() || !selectedCollection || loading) return;

    const userMessage: ChatMessage = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    const queryText = input.trim();
    setInput("");
    setLoading(true);

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const controller = new AbortController();
    abortRef.current = controller;

    // 本期不引入 ChatBox 内的筛选入口（仅在 /search 抽屉中可用）；
    // ChatBox 仍透传 filters（如未来扩展"高级筛选"图标，可在此组装）
    const filters: SearchFilters | undefined = undefined;

    try {
      await api.chatStream(
        {
          query: queryText,
          collection_id: selectedCollection,
          conversation_id: convIdRef.current ?? undefined,
          use_reranker: useReranker,
          filters,
        },
        (event: StreamEvent) => {
          if (event.type === "token") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + event.content,
                };
              }
              return updated;
            });
          } else if (event.type === "sources") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = { ...last, sources: event.sources };
              }
              return updated;
            });
          } else if (event.type === "done") {
            if (event.conversation_id && !convIdRef.current) {
              convIdRef.current = event.conversation_id;
              onConversationCreated?.(event.conversation_id);
            }
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  content: event.answer || last.content,
                  sources: event.sources || last.sources,
                };
              }
              return updated;
            });
            if (event.conversation_id) {
              api.getConversation(event.conversation_id).then((detail) => {
                const favs: Record<string, boolean> = {};
                for (const msg of detail.messages) {
                  if (msg.id && msg.is_favorited) favs[msg.id] = true;
                }
                setFavorites(favs);
                setMessages((prev) =>
                  prev.map((m, i) => ({
                    ...m,
                    id: detail.messages[i]?.id ?? m.id,
                  }))
                );
              }).catch(() => {});
            }
          } else if (event.type === "error") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  content: `抱歉，出现了错误：${event.content}`,
                };
              }
              return updated;
            });
          }
        },
        controller.signal,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: `抱歉，出现了错误：${err instanceof Error ? err.message : "请求失败"}`,
            };
          }
          return updated;
        });
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [input, selectedCollection, loading, useReranker, onConversationCreated]);
```

- [ ] **Step 3: 替换回答正文渲染为 HighlightedText**

定位第 326-328 行（`<p>` 元素），**整个替换**为：

```tsx
                    <p className="text-[15px] whitespace-pre-wrap leading-relaxed">
                      <HighlightedText
                        text={msg.content}
                        terms={msg.sources?.[0]?.highlight_terms ?? []}
                      />
                    </p>
```

说明：SSE 推送的 `sources` 事件中每条 source 都带 `highlight_terms`，但内容一致；取第一条即可。

- [ ] **Step 4: TS + ESLint 验证**

```bash
cd frontend && npx tsc --noEmit && npx eslint src/components/ChatBox.tsx
```

预期：tsc 无错误；eslint 仅允许 warning。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/ChatBox.tsx
git commit -m "feat(frontend): ChatBox uses HighlightedText for assistant answers + wires filters to chatStream"
```

---

## Task 17: 前端构建验证

**Files:**
- 验证整个 frontend 仓库

- [ ] **Step 1: 全量 TS 编译**

```bash
cd frontend && npx tsc --noEmit
```

预期：无错误输出。

- [ ] **Step 2: ESLint 全量**

```bash
cd frontend && npx eslint .
```

预期：无 error 输出。

- [ ] **Step 3: 修复发现的 ESLint warning（如有）**

常见 ESLint warning：
- `react-hooks/set-state-in-effect`：按 ProfileDialog.tsx 风格加 `// eslint-disable-next-line react-hooks/set-state-in-effect`
- `@next/next/no-img-element`：本期不引入图片，可忽略

- [ ] **Step 4: 生产构建**

```bash
cd frontend && npm run build
```

预期：构建成功，无错误。

- [ ] **Step 5: 提交（如果有 lint 修复）**

```bash
git add frontend/
git commit -m "chore(frontend): fix lint warnings after search enhancement integration"
```

---

## Task 18: 后端 + 前端端到端冒烟

**Files:**
- 验证（无文件改动）

- [ ] **Step 1: 启动后端 dev server**

```bash
cd backend && .venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

预期：服务正常启动，无报错（Qdrant / DB 等依赖若缺失允许日志告警，不阻塞 HTTP）。

- [ ] **Step 2: 启动前端 dev server（新终端）**

```bash
cd frontend && npm run dev
```

预期：编译成功并提示监听 3000 端口。

- [ ] **Step 3: 手动验证路径 A — 搜索 + 高亮**

1. 浏览器访问 `http://localhost:3000/login`，登录一个测试账号。
2. 进入 `/search`，选 KB，输入"运维"（或 KB 中实际存在的关键词），点搜索。
3. 预期：结果卡片文本里"运维"出现 `<mark>` 背景色。
4. 切换不同 query，验证高亮跟随 query 变化。

- [ ] **Step 4: 手动验证路径 B — 高级筛选**

1. 在 `/search` 选 KB，点右上角"高级"按钮。
2. 预期：抽屉从右向左滑入，显示文件类型 / 上传者 / 标签 / 文件名四类选项（facet 选项来自后端）。
3. 勾选文件类型 + 选择上传者 + 输入文件名包含字串，点"应用筛选"。
4. 预期：抽屉关闭，搜索框下方出现"已应用 N 项"徽章 + 筛选摘要 chips。
5. 点"搜索"，结果应全部满足筛选条件。
6. 点"清空"，再搜索，验证结果恢复无筛选状态。

- [ ] **Step 5: 手动验证路径 C — 聊天高亮**

1. 进入 `/chat`，选 KB，输入"什么是 SLO"（或一个文档里实际有的词）。
2. 流式回答中相关词应显示 `<mark>` 高亮。
3. 展开"引用来源 (N)"，每个 SourceCard 文本中的命中词也高亮。

- [ ] **Step 6: 手动验证路径 D — 权限边界**

1. 用 viewer 角色账号登录，进入 `/search`。
2. 选一个对该账号无权限的 KB（应被 API 403 拦截）。
3. 切换回有权限的 KB，验证 facets 重新加载。

- [ ] **Step 7: 关闭两个 dev server（Ctrl+C）**

- [ ] **Step 8: 提交（如有修复）**

```bash
git add backend/ frontend/
git commit -m "fix: address issues found in manual e2e verification"
```

---

## Task 19: 更新部署文档与验收清单

**Files:**
- Modify: `docs/系统设计文档.md`（追加章节）
- Modify: `README.md`（如需更新部署步骤）

- [ ] **Step 1: 在 `docs/系统设计文档.md` 追加章节**

打开 `docs/系统设计文档.md`，在文末追加：

```markdown
## 搜索结果增强包（v6 迁移 + 高亮 + 高级过滤）

### 部署步骤

1. 部署后端代码后，先执行 v6 迁移：
   ```bash
   cd backend && source .venv/bin/activate
   python scripts/migrate_v6_uploader.py
   ```
2. 上传一个测试文档以触发新 payload 写入（uploader_id / tag_ids / collection_id / document_id）。
3. 部署前端代码 + `npm run build` 通过。

### 回滚

```bash
cd backend && source .venv/bin/activate
python scripts/migrate_v6_uploader.py --rollback
```

旧 chunks 缺少 payload 新字段 → 前端展示默认空值（如"未知作者"），不报错。

### 验收清单

- [ ] 关键词高亮（搜索结果 / 引用来源 / 聊天回答三处场景）
- [ ] 抽屉式筛选面板（文件类型 / 上传者 / 标签 / 文件名包含）
- [ ] facets 自动加载（按 KB 切换，localStorage 5min 缓存）
- [ ] viewer+ 权限边界正常
- [ ] 旧数据兼容（uploader_id=NULL 显示"未知作者"）
```

- [ ] **Step 2: 在 `README.md` 中如有"部署"章节，追加上述迁移说明；无则跳过**

```bash
grep -q "migrate_v6_uploader" README.md || echo "（无需更新 README.md）"
```

- [ ] **Step 3: 提交**

```bash
git add docs/
git commit -m "docs: add v6 migration + search enhancement deployment notes"
```

---

## 自审结果

### 1. Spec 覆盖核对

| 设计文档章节 | 实施计划覆盖 |
|---|---|
| §3.1 Document ORM 新字段 | Task 1 |
| §3.2 migrate_v6_uploader.py | Task 2 |
| §3.3 Qdrant payload 字段定义 | Task 5 |
| §3.4 Pydantic Schema 扩展 | Task 4 |
| §4.1 POST /search 扩展 | Task 8 |
| §4.2 GET /search/facets | Task 8 |
| §4.3 chat / chat_stream 扩展 | Task 9 |
| §5.3 BM25 命中词算法 | Task 3 |
| §6.2 HighlightedText 组件 | Task 12 |
| §6.3 AdvancedFilterPanel 组件 | Task 13 |
| §6.4 SearchBox 集成 | Task 14 |
| §6.5 ChatBox 集成 | Task 16 |
| §6.5 SourceCard 高亮 | Task 15 |
| §6.6 facet 缓存策略 | Task 14 |
| §7 测试策略 | Task 10、Task 17、Task 18 |
| §8.3 回滚策略 | Task 2、Task 19 |

无遗漏。

### 2. 占位符扫描

未发现以下问题：
- 0 处 `TBD` / `TODO` / `implement later`
- 0 处"add appropriate error handling"占位
- 0 处省略代码（每个步骤都展示了完整代码）
- 0 处 `Similar to Task N` 跳过

### 3. 类型一致性核对

- `SearchFilters`：Pydantic v2 (`backend/app/schemas/chat.py`) ↔ TypeScript (`frontend/src/types/index.ts`) 字段对齐：`file_types / uploader_ids / tag_ids / filename_contains`
- `FacetOption`：字段 `value / label / count`，前后端一致
- `SearchFacetsResponse`：字段 `uploaders / tags / file_types`，列表元素均为 `FacetOption`
- `SourceItem.highlight_terms`：在 Pydantic 中默认 `[]`，在 TS 中 `?` 可选 — 调用方均用 `?? []` 兜底
- `ChatService.chat_stream` 参数 `filters: Optional[dict]` ↔ Task 7 步骤 2 中 API 路由通过 `request.filters.model_dump(exclude_none=True)` 传入

### 4. 关键约束遵守

- ✅ BM25 不上 jieba：仅 `re.split(r"[\s,。;；、]+", query_text)`
- ✅ XSS 防护：HighlightedText 不使用 `dangerouslySetInnerHTML`
- ✅ 抽屉式：AdvancedFilterPanel 使用 `createPortal(..., document.body)`
- ✅ ESLint 规则：useEffect 同步 setState 加 `// eslint-disable-next-line react-hooks/set-state-in-effect` 豁免
- ✅ 向后兼容：所有新增字段 Optional / 默认值；旧 chunks 缺字段时 `?? []` 兜底
- ✅ 迁移幂等：`_has_column / _has_index / _has_constraint` 三步先查后建

---

## Execution Handoff

计划已完整保存到 `docs/superpowers/plans/2026-07-16-search-experience-enhancement.md`。

**两种执行方式：**

**1. Subagent-Driven (推荐)** — 每个任务派一个新 subagent 独立执行，任务间人工 review 反馈，快速迭代、上下文隔离；适合 19 个相对独立的任务。

**2. Inline Execution** — 在当前会话按 Task 1 → Task 19 顺序执行，每完成一组任务暂停汇报进度；上下文集中但单会话压力大。

**请选择执行方式：**