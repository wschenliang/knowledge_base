# CogniBase 搜索结果增强包设计方案

> 文档日期：2026-07-16
> 项目：CogniBase 企业知识库智能问答系统
> 范围：**搜索结果增强包**（关键词高亮 + 高级搜索过滤）
> 关联子项目（后续独立 spec）：知识图谱可视化、问答后相关推荐

---

## 1. 需求概述

### 1.1 背景

CogniBase 当前 RAG 问答流程已具备 **混合检索（向量 + BM25 + RRF）+ 重排序 + 流式合成 + 对话持久化**能力。但用户在「/search 语义搜索」和「/chat 知识问答」两个场景下，体验上仍有明显缺口：

1. 搜索结果纯文本展示，**命中关键词无视觉高亮**，阅读时需要反复对比查询词；
2. 搜索仅支持「query + KB 选择 + 重排序开关」，**没有按文件类型、上传者、文件名、标签的多维筛选**；
3. 聊天回答正文与「引用来源」卡片中，同样缺乏关键词高亮；
4. 用户提问后，**没有基于上下文的相关问题引导**，下一轮要靠自己重新组织提问（该缺口在后续独立 spec 处理，本设计文档不覆盖）。

本设计文档聚焦在 **缺口 1+2+3 的统一实现**，作为一次小步快跑的功能交付。

### 1.2 目标

- **关键词高亮**：搜索结果、问答引用来源、聊天回答正文三处场景中，BM25 命中词以 `<mark>` 视觉呈现；
- **高级搜索过滤**：在搜索框旁提供抽屉式筛选面板，支持文件类型 / 上传者 / 标签 / 文件名包含四类条件；
- **Facet 选项自动加载**：切换知识库后，筛选面板的可选值（可选上传者、标签、文件类型）按需刷新；
- **向后兼容**：旧客户端 / 旧数据 / 旧 chunk 全部正常运行，无破坏性改动。

### 1.3 约束

- 沿用现有代码风格：后端 FastAPI + SQLAlchemy 异步 ORM + Qdrant；前端 Next.js 16 + Tailwind 4 + React 19；
- 沿用项目已有约定：[createPortal 渲染弹窗](file:///d:/workspace/knowledge_base/frontend/src/components/ProfileDialog.tsx)（避免父级 `overflow`/transform 影响 fixed 居中）、统一容器布局 (`mx-auto max-w-7xl px-4 py-6`)、ESLint 规则豁免（useEffect 同步 setState）；
- 权限模型不变：`viewer+` 才能搜索；
- 仅做轻量级 SQL 迁移（不重建 Qdrant 索引）；
- 高亮算法本期不上中文分词（jieba 等），仅做子串匹配 + 大小写不敏感；中文高亮精度靠 BM25 命中词本身。

### 1.4 非目标（Out of Scope）

- 时间范围筛选（用户首轮决策不纳入）
- 相似度阈值筛选（用户首轮决策不纳入）
- 跨 KB 聚合搜索（沿用单 KB 设计）
- 中文分词增强高亮精度
- 知识图谱与相关推荐（独立子项目）

---

## 2. 架构设计

### 2.1 整体架构

```
┌──────────────────────────────────────────────────────────────┐
│                     前端 SearchBox / ChatBox                   │
│  query + filters + use_reranker →                              │
│  SearchRequest{Filters}                                        │
│  ← SearchResponse{results[], highlight_terms, applied_filters}│
│  ← facets{uploader/tag/file_type 选项}                        │
└──────────────────┬───────────────────────────────────────────┘
                   │ HTTP / REST
┌──────────────────▼───────────────────────────────────────────┐
│               search.py + chat_service.search (扩展)          │
│  1) 校验 filters + collection 权限                            │
│  2) 调用 rag_engine.search(filter_condition=...)             │
│  3) 取 BM25 命中词 → highlight_terms                         │
│  4) 返回 SearchResponse（含 highlight_terms、applied_filters）│
└──────────────────┬───────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
┌────────────────────┐  ┌────────────────────────────────────┐
│ HybridRetriever    │  │ Document ORM (新增 uploader_id)     │
│  - _vector_search  │  │ Qdrant payload 写入:                │
│    (接受 filter)   │  │  file_type, uploader_id,            │
│  - get_query_      │  │  uploader_username, document_id,    │
│    highlight_terms │  │  tag_ids, tag_names, collection_id  │
└────────────────────┘  └────────────────────────────────────┘
```

### 2.2 改动模块清单

| 层 | 文件 | 改动类型 | 改动概要 |
|---|---|---|---|
| ORM | [backend/app/models/document.py](file:///d:/workspace/knowledge_base/backend/app/models/document.py) | 修改 | `Document` 新增 `uploader_id` 字段（外键 user，SET NULL） |
| 迁移 | `backend/app/scripts/migrate_v6_uploader.py` | 新建 | 给 `documents` 加列 + 索引；幂等脚本；支持 `--rollback` |
| 检索 | [backend/app/rag/retriever.py](file:///d:/workspace/knowledge_base/backend/app/rag/retriever.py) | 修改 | `_vector_search` 接受 `filter_condition` 并透传；新增 `get_query_highlight_terms()` |
| RAG 引擎 | [backend/app/rag/engine.py](file:///d:/workspace/knowledge_base/backend/app/rag/engine.py) | 修改 | `index_document` payload 写入 `file_type` / `uploader_id` / `uploader_username` / `document_id` / `tag_ids` / `tag_names` / `collection_id`；`search()` 返回值新增 `highlight_terms` |
| 服务 | [backend/app/services/chat_service.py](file:///d:/workspace/knowledge_base/backend/app/services/chat_service.py) | 修改 | `search()` / `chat()` / `chat_stream()` 接受 `filters`，把 `highlight_terms` 透传 |
| Schema | [backend/app/schemas/chat.py](file:///d:/workspace/knowledge_base/backend/app/schemas/chat.py) | 修改 | 新增 `SearchFilters`、`HighlightedSpan`、`SearchResultItem`、`SearchFacetsResponse`、`FacetOption`、`StreamEvent` 扩展 `sources.highlight_terms` |
| API | [backend/app/api/search.py](file:///d:/workspace/knowledge_base/backend/app/api/search.py) | 修改 | `/search` 接受 filters；新增 `GET /search/facets` |
| API | [backend/app/api/chat.py](file:///d:/workspace/knowledge_base/backend/app/api/chat.py) | 修改 | `/chat` `/chat/stream` 接受 filters；SSE `sources` 事件含 `highlight_terms` |
| 前端类型 | [frontend/src/types/index.ts](file:///d:/workspace/knowledge_base/frontend/src/types/index.ts) | 修改 | 新增 `SearchFilters`、`SearchFacetsResponse`、`FacetOption`、`HighlightedTextProps` |
| 前端 API | [frontend/src/lib/api.ts](file:///d:/workspace/knowledge_base/frontend/src/lib/api.ts) | 修改 | `search()` 接受 filters；新增 `getSearchFacets()`；`chatStream` 事件类型扩展 |
| 前端组件 | `frontend/src/components/HighlightedText.tsx` | 新建 | 高亮渲染组件，区间合并 + 子串匹配 |
| 前端组件 | `frontend/src/components/AdvancedFilterPanel.tsx` | 新建 | 抽屉式筛选面板，createPortal 渲染 |
| 前端组件 | `frontend/src/components/SourceCard.tsx` | 修改 | 替换纯文本为 HighlightedText；头部增加 file_type / uploader 信息 |
| 前端页面 | [frontend/src/components/SearchBox.tsx](file:///d:/workspace/knowledge_base/frontend/src/components/SearchBox.tsx) | 修改 | 接入 filters、抽屉按钮、facet 加载 |
| 前端页面 | [frontend/src/components/ChatBox.tsx](file:///d:/workspace/knowledge_base/frontend/src/components/ChatBox.tsx) | 修改 | 回答正文使用 HighlightedText |

---

## 3. 后端数据模型

### 3.1 Document ORM 字段

`backend/app/models/document.py` 中 `Document` 类新增：

```python
uploader_id: Mapped[Optional[str]] = mapped_column(
    String(36),
    ForeignKey("users.id", ondelete="SET NULL"),
    nullable=True,
    index=True,  # facet 查询性能
)
```

- 不强制 NOT NULL：旧文档 `uploader_id = NULL`，UI 显示"未知作者"；
- ON DELETE SET NULL：上传者被禁用/删除不级联删除文档；
- 加索引：`facets` 端点按 uploader_id 分组统计时走索引。

### 3.2 迁移脚本 `migrate_v6_uploader.py`

**前置检查（幂等）：**

```python
def has_uploader_column(conn):
    rows = conn.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name = 'documents' AND column_name = 'uploader_id'"
    )).fetchall()
    return len(rows) > 0
```

**主流程：**

```sql
ALTER TABLE documents ADD COLUMN uploader_id VARCHAR(36);
CREATE INDEX IF NOT EXISTS ix_documents_uploader_id ON documents(uploader_id);
ALTER TABLE documents ADD CONSTRAINT fk_documents_uploader_id
    FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE SET NULL;
```

**回滚：**

```bash
python scripts/migrate_v6_uploader.py --rollback
```

执行：

```sql
ALTER TABLE documents DROP CONSTRAINT IF EXISTS fk_documents_uploader_id;
DROP INDEX IF EXISTS ix_documents_uploader_id;
ALTER TABLE documents DROP COLUMN IF EXISTS uploader_id;
```

**迁移脚本运行方式：**

```bash
cd backend && .venv/Scripts/activate
python scripts/migrate_v6_uploader.py            # 应用
python scripts/migrate_v6_uploader.py --rollback # 回滚
```

部署时由运维手动执行（启动日志会提示），不放入 `init_db` 自动迁移。

### 3.3 Qdrant payload 字段定义

`engine.py` 中 `index_document` 的 payload 必须**显式包含以下字段**：

| 字段 | 类型 | 来源 | 写入时机 |
|---|---|---|---|
| `text` | str | chunk | 已有 |
| `chunk_index` | int | chunker | 已有 |
| `filename` | str | Document.filename | 已有 |
| `file_path` | str | Document.file_path | 已有 |
| `file_type` | str | Document.file_type | **确认显式写入**（之前散落在 metadata 中） |
| `uploader_id` | str | Document.uploader_id | **新增** |
| `uploader_username` | str | User.username（写入时一次性快照） | **新增** |
| `document_id` | str | Document.id | **新增**（chunk → Document 反查） |
| `tag_ids` | List[str] | Collection 当前 tag_ids（写入时快照） | **新增** |
| `tag_names` | List[str] | 对应 tag 名称快照 | **新增** |
| `collection_id` | str | Document.collection_id | **新增**（之前要从 qdrant collection 名反推） |

> **快照策略说明：** Qdrant payload 不支持跨集合 join，因此把 uploader/tag/collection 等关联字段在写入时一次性快照进 payload。后续如果文档上传者变更或标签被改名，旧 chunks 的相关字段会过期。**不强制重建**，由运维按需增量重建（不在本期 spec 范围）。

### 3.4 Pydantic Schema

`backend/app/schemas/chat.py` 新增/扩展：

```python
from typing import Optional, List
from pydantic import BaseModel

class SearchFilters(BaseModel):
    """高级搜索筛选条件（向后兼容：所有字段 Optional）"""
    file_types: Optional[List[str]] = None      # 例如 ["pdf", "docx"]
    uploader_ids: Optional[List[str]] = None    # user_id 列表
    tag_ids: Optional[List[str]] = None         # tag_id 列表
    filename_contains: Optional[str] = None     # 文件名 LIKE 模糊匹配


class SearchRequest(BaseModel):
    """语义搜索请求（向后兼容：filters 默认 None）"""
    query: str
    collection_id: str
    top_k: int = 10
    use_reranker: bool = True
    filters: Optional[SearchFilters] = None


class HighlightedSpan(BaseModel):
    """高亮区间"""
    start: int
    end: int


class SearchResultItem(BaseModel):
    """单条搜索结果（向后兼容：所有新字段默认空值）"""
    index: int
    source: str
    text: str
    score: float
    file_type: Optional[str] = None
    uploader_username: Optional[str] = None
    document_id: Optional[str] = None
    tag_ids: List[str] = []
    highlight_terms: List[str] = []


class SearchResponse(BaseModel):
    """搜索响应"""
    query: str
    results: List[SearchResultItem]
    total: int
    applied_filters: Optional[SearchFilters] = None   # 回显当前生效筛选


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

**前端 `StreamEvent` 联合类型扩展**（`frontend/src/types/index.ts`）：

```typescript
// SourceItem 增加 highlight_terms
export interface SourceItem {
  index: number;
  source: string;
  text: string;
  score: number;
  file_type?: string | null;
  uploader_username?: string | null;
  document_id?: string | null;
  tag_ids?: string[];
  highlight_terms?: string[];   // 新增
}

export type StreamEvent =
  | { type: "sources"; sources: SourceItem[] }
  | { type: "token"; content: string }
  | { type: "done"; answer: string; sources: SourceItem[]; conversation_id: string }
  | { type: "error"; content: string };
```

---

## 4. API 设计

### 4.1 `POST /api/v1/search` （扩展）

**请求体：**

```json
{
  "query": "运维指标",
  "collection_id": "uuid",
  "top_k": 10,
  "use_reranker": true,
  "filters": {
    "file_types": ["pdf", "md"],
    "uploader_ids": ["alice-id"],
    "tag_ids": ["tag-id-1"],
    "filename_contains": "监控"
  }
}
```

**响应体：**

```json
{
  "query": "运维指标",
  "total": 7,
  "applied_filters": { ... },          // 回显当前生效筛选
  "results": [
    {
      "index": 0,
      "source": "运维手册.pdf",
      "text": "本章介绍运维指标的...",
      "score": 0.87,
      "file_type": "pdf",
      "uploader_username": "alice",
      "document_id": "doc-uuid",
      "tag_ids": ["tag-1", "tag-2"],
      "highlight_terms": ["运维", "指标"]
    }
  ]
}
```

**权限：** viewer+，沿用 `require_collection_role`。

**错误码：**

| 状态码 | 含义 |
|---|---|
| 400 | `collection_id` 无效 / query 为空 |
| 403 | 用户对 KB 无 viewer 权限 |
| 500 | Qdrant filter 抛错等内部异常 |

### 4.2 `GET /api/v1/search/facets` （新增）

**Query 参数：**

- `collection_id`：必填，KB UUID

**响应体：**

```json
{
  "uploaders": [
    { "value": "alice-uuid", "label": "alice", "count": 12 },
    { "value": "bob-uuid", "label": "bob", "count": 8 }
  ],
  "tags": [
    { "value": "tag-1", "label": "运维", "count": 15 }
  ],
  "file_types": [
    { "value": "pdf", "label": "PDF", "count": 20 },
    { "value": "docx", "label": "Word", "count": 5 }
  ]
}
```

**实现要点（性能）：**

- 一次 SQL 联查 `documents` + `collection_tags` + `tags` + `users`
- 分组统计每个 uploader/tag/file_type 的文档数
- 仅返回当前 KB 范围；viewer+ 权限校验
- 数据量级千级文档，毫秒级返回

**可选优化（不在本期）：** Redis 缓存 5 分钟。

### 4.3 `POST /api/v1/chat` / `POST /api/v1/chat/stream` （扩展）

**请求体新增可选字段：**

```python
class ChatRequest(BaseModel):
    query: str
    collection_id: str
    conversation_id: Optional[str] = None
    top_k: int = 5
    use_reranker: bool = True
    filters: Optional[SearchFilters] = None   # 新增
```

**SSE `sources` 事件扩展：**

```
data: {"type": "sources", "sources": [
  {"index": 0, "source": "...", "text": "...", "score": 0.9,
   "file_type": "pdf", "uploader_username": "alice",
   "document_id": "doc-uuid", "highlight_terms": ["运维"]}
]}
```

`done` 事件中的 `sources` 字段同步扩展。

---

## 5. BM25 命中词提取算法

### 5.1 目标

给定用户 query 与若干 BM25 命中 chunk，返回**该 query 中实际出现在 chunk 文本里的关键词列表**，供前端 `<mark>` 使用。

### 5.2 位置与签名

`backend/app/rag/retriever.py` 新增方法：

```python
class HybridRetriever:
    def get_query_highlight_terms(
        self,
        query_text: str,
        top_results: List[dict],   # BM25 命中 chunks（已含 text）
        max_terms: int = 8,
    ) -> List[str]:
        """从 BM25 命中片段提取关键词用于前端高亮。"""
```

### 5.3 算法步骤

1. **过滤输入**：去掉空字符串、长度 < 2 的项
2. **粗切 query**：以空白 + 中英文标点切分（不依赖 jieba，简单 `re.split(r"[\s,。;；、]+", query_text)`）
3. **逐 chunk 命中**：对每个 chunk，遍历 query 切分后的每个 term，用 `term.lower() in chunk.text.lower()` 判断是否出现
4. **去重 + 频次统计**：统计每个 term 在多少 chunk 中出现，按频次降序
5. **截断**：返回前 `max_terms=8` 个
6. **特殊处理**：原 query 中**完整短语**（如"运维指标"）如果没有被空白切分且在 chunk 中出现，**优先保留**在结果首位

### 5.4 边界

| 输入 | 输出 |
|---|---|
| `query_text=""` | `[]` |
| `top_results=[]` | `[]` |
| query 中的词不在任何 chunk 中 | `[]`（高亮退化无） |
| 命中词 > 8 个 | 只返回前 8 个 |
| 命中词为其他命中词子串 | 都保留（前端区间合并处理） |

### 5.5 为什么不直接返回 BM25 的 raw tokens？

BM25 内部已经做了 tokenization + 词频统计，但 **`rank_bm25` 库不暴露每个 chunk 命中的 token 列表**。自己实现一套轻量的命中词提取，比反查 BM25 内部状态更可控，且足够覆盖本期高亮需求。

---

## 6. 前端组件设计

### 6.1 目录与文件

新增两个组件文件：

```
frontend/src/components/
  HighlightedText.tsx          # 高亮渲染
  AdvancedFilterPanel.tsx      # 抽屉式筛选面板
```

修改：

```
frontend/src/components/
  SearchBox.tsx                # 接入 filters + 抽屉按钮
  SourceCard.tsx               # 替换纯文本为 HighlightedText
  ChatBox.tsx                  # 回答正文替换为 HighlightedText
frontend/src/types/index.ts    # 新增类型
frontend/src/lib/api.ts        # 扩展 search / 新增 getSearchFacets
```

### 6.2 `HighlightedText` 组件

```typescript
interface HighlightedTextProps {
  text: string;
  terms: string[];                     // BM25 命中词
  highlightClassName?: string;         // 默认 "bg-amber-200 text-slate-900 rounded px-0.5"
  caseSensitive?: boolean;             // 默认 false
}
```

**算法：**

1. 过滤 `terms` 中空字符串、长度 < 2 的项
2. 遍历 terms，对每个 term 在 text 中找所有 `[start, end)` 区间（`indexOf` + `from`）
3. 区间合并：按 start 排序，扫描时合并重叠/相邻区间
4. 把合并后区间切片渲染：命中区间包 `<mark>`，非命中区间原文输出
5. **XSS 防护：React 默认转义 text 节点；禁止 `dangerouslySetInnerHTML`**

**边界处理：**

- 命中词是其他命中词子串：合并后避免嵌套 `<mark><mark>...</mark></mark>`
- 大小写：根据 `caseSensitive` 切换 `toLowerCase` 副本做匹配，但切片用原 text

### 6.3 `AdvancedFilterPanel` 组件

**形态：** 点击 SearchBox 右侧"⚙️ 高级"按钮 → 抽屉从右向左滑入。

**关键实现：**

- 用 `React.createPortal` 渲染到 `document.body`（沿用 [项目惯例](file:///d:/workspace/knowledge_base/.qoder/plans/操作审计日志完整实现_f3470647.md)，避免父级 `overflow`/transform 影响 fixed 居中）
- 遮罩 + 抽屉主体两层；点击遮罩或按 ESC 关闭
- **不自渲染按钮**：通过 props 接收 `open` / `onClose` / `facets` / `initialFilters` / `onApply`

**抽屉内部布局：**

```
┌────────────────────────────┐
│ 高级筛选              [✕]  │
├────────────────────────────┤
│ 📁 文件类型               │
│ [☐ PDF] [☐ DOCX] [☐ MD]… │
├────────────────────────────┤
│ 👤 上传者                  │
│ [多选下拉，搜索+选择]      │
├────────────────────────────┤
│ 🏷️ 知识库标签             │
│ [多选下拉，搜索+选择]      │
├────────────────────────────┤
│ 📝 文件名包含              │
│ [文本输入框]               │
├────────────────────────────┤
│ [清空]      [应用筛选]     │
└────────────────────────────┘
```

- 文件类型用 checkbox 横向排列（最多 6 种常见类型）
- 上传者/标签用多选下拉（lucide-react 已有 Check + ChevronDown）
- "应用筛选"按钮触发 `onApply(filters)` 回调，**不立即搜索**（让用户能一次调多个条件再搜）
- 已应用筛选时，抽屉标题旁显示"已应用 N 项"

### 6.4 SearchBox 集成

**状态：**

```typescript
const [filters, setFilters] = useState<SearchFilters>({});          // 编辑中
const [appliedFilters, setAppliedFilters] = useState<SearchFilters>({});  // 已应用，传给后端
const [drawerOpen, setDrawerOpen] = useState(false);
const [facets, setFacets] = useState<SearchFacetsResponse | null>(null);
```

**行为：**

- 页面加载 + 切换 KB 时：`api.getSearchFacets(collectionId)` 加载 facet 选项
- 打开抽屉：传入当前 `filters`（待应用值），用户编辑后点"应用筛选"才更新 `appliedFilters`
- "搜索"按钮点击：发送 `query + appliedFilters`
- 已应用筛选时，搜索框右侧显示"N 项筛选已应用"+ 点击可重新打开抽屉编辑
- 已有功能（reranker toggle、KB 选择）保持不变

### 6.5 ChatBox 集成

**回答正文高亮：**

- 把 `<p>{msg.content}</p>` 改为 `<HighlightedText text={msg.content} terms={msg.highlight_terms ?? []} />`
- 后端在 `chat_stream` 的 `sources` 事件中带上 `highlight_terms`（同一个 RAG 检索结果，命中词共用）

**引用来源卡片：**

- `SourceCard.tsx` 替换纯文本为 HighlightedText
- 卡片头部小图标旁增加 file_type 图标 + 上传者头像（小圆点首字母）

### 6.6 缓存策略

- facet 数据按 `collection_id` 缓存到 `localStorage`，TTL 5 分钟
- key 格式：`search_facets_<collection_id>`
- 切换 KB 时旧缓存过期
- 已有"我的对话/收藏"等缓存机制沿用

---

## 7. 测试策略

### 7.1 单元测试

| 模块 | 测试点 |
|---|---|
| `HybridRetriever.get_query_highlight_terms` | 子串匹配、重叠合并、空查询、过长 terms 截断、中文标点切分 |
| `HybridRetriever._vector_search` | filter_condition 正确拼装为 Qdrant Filter 对象 |
| `ChatService.search` | filters 正确透传到 retriever；applied_filters 回显正确 |
| `HighlightedText` | 重叠区间合并、大小写切换、空 terms、纯文本渲染 |
| `AdvancedFilterPanel` | 多选切换、ESC 关闭、清空、应用回调 |

### 7.2 端到端验收路径

**路径 A — 搜索 + 关键词高亮：**

1. 登录 → 进入 /search
2. 选 KB → 输入"运维指标" → 搜索
3. 确认结果卡片中"运维"和"指标"被 `<mark>` 高亮
4. 切换不同 query，确认高亮跟着变

**路径 B — 高级筛选：**

1. 选 KB → 点"⚙️ 高级" → 抽屉打开
2. 勾选 file_type=pdf、uploader=alice、tag=运维、filename=监控
3. 点"应用筛选" → 抽屉关闭
4. 搜索框旁出现"4 项筛选已应用"
5. 搜索 → 结果全部满足筛选条件
6. 清空筛选 → 搜索结果恢复无筛选

**路径 C — 聊天场景高亮：**

1. 选 KB → 输入问题"什么是 SLO"
2. 流式回答中"SLO"等词高亮
3. 展开"引用来源 (3)"，每个 SourceCard 文本中的命中词也高亮

**路径 D — 权限边界：**

1. viewer 角色登录 → /search 能正常搜索
2. 无权限 KB → 403 + 友好提示
3. 切换 KB 时 facets 自动重新加载

### 7.3 边界场景清单

- 旧文档 uploader_id=NULL：UI 显示"未知作者"
- 旧 chunk 缺少 payload 字段：filter 跳过；高亮 terms 为空
- 中文 + 英文混合 query：都能匹配
- 命中词是其他命中词子串：合并后无嵌套 mark
- 抽屉在 1920/1280/768 三档宽度下布局正常

---

## 8. 部署与回滚

### 8.1 部署步骤

1. 后端代码部署 → 启动后日志会提示"未执行 migrate_v6"
2. 手动执行迁移：
   ```bash
   cd backend && source .venv/bin/activate
   python scripts/migrate_v6_uploader.py
   ```
3. 上传一个测试文档触发新 payload 写入（任意 KB 上传任意文档）
4. 前端代码部署 + `npm run build` 通过
5. 在监控面板观察 search latency（filter 增加预期 +20ms 以内）

### 8.2 灰度建议

- 第 1 周：仅 owner 角色开放高级筛选入口
- 第 2 周：放开全部 viewer
- 第 3 周：评估 facet 缓存是否需要引入 Redis

### 8.3 回滚策略

| 改动 | 回滚方式 |
|---|---|
| `Document.uploader_id` | `python scripts/migrate_v6_uploader.py --rollback` |
| Qdrant payload 缺字段 | 旧 chunk 不带新字段 → 前端展示默认空值，不报错 |
| `SearchRequest.filters` | Pydantic 默认 Optional；前端不传就忽略 |
| `SearchResponse.highlight_terms` / `applied_filters` | 同上，前端 `?? []` 兜底 |
| `HighlightedText` 组件 | SearchReplace 回退到 `text` 直接渲染 |
| `AdvancedFilterPanel` | SearchBox 中删除"⚙️ 高级"按钮与引用 |
| `/search/facets` 端点 | 前端跳过 facet 加载；空 facets 时筛选面板显示"暂无选项" |

### 8.4 验收清单（DoD）

- [ ] 所有单元测试通过
- [ ] 4 条端到端路径手动验证通过
- [ ] viewer 角色权限边界正常
- [ ] 旧数据（uploader_id=NULL）展示友好
- [ ] 高亮在重叠/中文/英文场景下渲染正确
- [ ] 抽屉式面板在 1920/1280/768 三档宽度下布局正常
- [ ] 没有新增 ESLint 报错（createPortal 已合规、useEffect 同步 setState 已加禁用豁免）
- [ ] 部署文档更新到 `README.md` / `docs/系统设计文档.md`

---

## 9. 关联子项目（不在本 spec 范围）

| 子项目 | 关联说明 |
|---|---|
| 知识图谱可视化 | 文档/Chunk 间关联关系存储 + 关系图渲染。本期不涉及。 |
| 问答后相关推荐 | 基于收藏 TopQuestions + 当前回答语义的相似问题推荐。本期不涉及。 |

这两个子项目将各自独立 spec + plan + 实现，按用户决定在后续 brainstorm 轮次中启动。