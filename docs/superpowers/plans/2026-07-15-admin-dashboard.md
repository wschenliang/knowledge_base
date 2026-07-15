# 管理后台 Dashboard 开发计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 `/dashboard` 路径下的统计面板，支持管理员看全站数据、普通用户看个人数据，包含 KPI 卡片、趋势图、热门知识库、活跃用户、高频问题等模块。

**Architecture:** 后端新增单一聚合 API `/api/v1/dashboard/stats`，根据 JWT role 返回不同字段；前端单页加载并分发数据，按 role 渲染 admin 版或 user 版 Dashboard。现有 `/dashboard`（个人知识库管理）重命名为 `/knowledge-bases`。

**Tech Stack:** FastAPI + SQLAlchemy + Next.js + Recharts + Tailwind CSS + lucide-react

---

## 文件结构

### 后端新增/修改

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/app/schemas/dashboard.py` | 创建 | DashboardStatsResponse 等 schema |
| `backend/app/services/dashboard_service.py` | 创建 | 聚合统计服务（含 SQL 查询 + 词频统计） |
| `backend/app/api/dashboard.py` | 创建 | Dashboard API endpoint |
| `backend/app/main.py` | 修改 | 注册 dashboard router |

### 前端新增/修改

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/app/dashboard/page.tsx` | 创建 | 新 Dashboard 页面（按 role 渲染） |
| `frontend/src/app/dashboard/page.tsx` | 删除 | 现有 dashboard 页面（被新页面替换前先重命名） |
| `frontend/src/app/knowledge-bases/page.tsx` | 创建 | 重命名后的知识库管理页 |
| `frontend/src/components/Layout.tsx` | 修改 | 更新侧栏导航 href 和 getPageTitle |
| `frontend/src/components/dashboard/KpiCards.tsx` | 创建 | KPI 数字卡片 |
| `frontend/src/components/dashboard/RangeSelector.tsx` | 创建 | 时间范围切换 |
| `frontend/src/components/dashboard/TrendChart.tsx` | 创建 | 趋势折线图 |
| `frontend/src/components/dashboard/TopCollections.tsx` | 创建 | 热门知识库列表 |
| `frontend/src/components/dashboard/TopUsers.tsx` | 创建 | 活跃用户列表 |
| `frontend/src/components/dashboard/TopQuestions.tsx` | 创建 | 高频问题标签云 |
| `frontend/src/components/dashboard/DashboardSkeleton.tsx` | 创建 | 加载占位 |
| `frontend/src/components/dashboard/DashboardHeader.tsx` | 创建 | 页面标题 + 刷新 |
| `frontend/src/lib/api.ts` | 修改 | 新增 getDashboardStats 方法 |
| `frontend/src/types/index.ts` | 修改 | 新增 DashboardStats 相关类型 |
| `frontend/package.json` | 修改 | 新增 recharts 依赖 |

---

## Task 1: 重命名现有 dashboard 页面为 /knowledge-bases

**Files:**
- Move: `frontend/src/app/dashboard/page.tsx` → `frontend/src/app/knowledge-bases/page.tsx`

- [ ] **Step 1: 创建 knowledge-bases 目录并移动页面**

Run:
```bash
cd d:\workspace\knowledge_base\frontend
mkdir -p src/app/knowledge-bases
git mv src/app/dashboard/page.tsx src/app/knowledge-bases/page.tsx
```

Expected: 文件移动成功，git 识别为 rename

- [ ] **Step 2: 更新移动后页面中的标题和注释**

打开 `frontend/src/app/knowledge-bases/page.tsx`，找到：
```tsx
        {/* 页面头部 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">知识库</h1>
```

改为：
```tsx
        {/* 页面头部 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">我的知识库</h1>
```

- [ ] **Step 3: 删除空的 dashboard 目录**

Run:
```bash
cd d:\workspace\knowledge_base\frontend
rmdir src/app/dashboard
```

- [ ] **Step 4: 更新 Layout.tsx 的 getPageTitle 函数**

打开 `frontend/src/components/Layout.tsx`，找到：
```typescript
function getPageTitle(pathname: string | null): string {
  if (!pathname) return "知识库";
  if (pathname.startsWith("/dashboard")) return "知识库管理";
  if (pathname.startsWith("/search")) return "语义搜索";
  if (pathname.startsWith("/chat")) return "智能问答";
  return "知识库";
}
```

改为：
```typescript
function getPageTitle(pathname: string | null): string {
  if (!pathname) return "知识库";
  if (pathname.startsWith("/dashboard")) return "数据概览";
  if (pathname.startsWith("/knowledge-bases")) return "我的知识库";
  if (pathname.startsWith("/search")) return "语义搜索";
  if (pathname.startsWith("/chat")) return "智能问答";
  return "知识库";
}
```

- [ ] **Step 5: 更新 Layout.tsx 中 sidebar 的导航链接**

打开 `frontend/src/components/ConversationList.tsx`（侧栏），找到"知识库"的 Link href 字段（如果存在），从 `/dashboard` 改为 `/knowledge-bases`。

提示：在 ConversationList 中搜索 `/dashboard`，替换为 `/knowledge-bases`。

- [ ] **Step 6: 验证前端编译**

Run:
```bash
cd d:\workspace\knowledge_base\frontend
npx tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 7: Commit**

```bash
cd d:\workspace\knowledge_base
git add -A
git commit -m "refactor: rename /dashboard to /knowledge-bases"
```

---

## Task 2: 后端 - 新增 Dashboard schema

**Files:**
- Create: `backend/app/schemas/dashboard.py`

- [ ] **Step 1: 创建 dashboard schema 文件**

Create `backend/app/schemas/dashboard.py`:

```python
"""Dashboard 统计响应 Pydantic 模型"""

from __future__ import annotations

import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class DashboardKPI(BaseModel):
    """KPI 卡片数据"""
    total_users: int = 0
    total_collections: int = 0
    total_documents: int = 0
    total_conversations: int = 0
    total_messages: int = 0
    today_messages: int = 0


class DailyCount(BaseModel):
    """每日计数"""
    date: str  # YYYY-MM-DD
    count: int


class TrendData(BaseModel):
    """趋势数据"""
    daily_messages: list[DailyCount] = []
    daily_documents: list[DailyCount] = []


class TopCollectionItem(BaseModel):
    """热门知识库条目"""
    id: str
    name: str
    question_count: int
    document_count: int
    owner_username: Optional[str] = None


class TopUserItem(BaseModel):
    """活跃用户条目"""
    user_id: str
    username: str
    display_name: Optional[str] = None
    message_count: int
    conversation_count: int


class TopQuestionItem(BaseModel):
    """高频问题条目"""
    query: str
    count: int
    last_asked_at: Optional[datetime.datetime] = None


class DashboardStatsResponse(BaseModel):
    """Dashboard 统计响应"""
    scope: Literal["admin", "user"]
    range_days: int
    generated_at: datetime.datetime

    kpi: DashboardKPI
    trends: TrendData

    top_collections: list[TopCollectionItem] = []
    top_users: Optional[list[TopUserItem]] = None  # 仅 admin 范围返回
    top_questions: list[TopQuestionItem] = []

    model_config = {"from_attributes": True}
```

- [ ] **Step 2: Commit**

```bash
cd d:\workspace\knowledge_base
git add backend/app/schemas/dashboard.py
git commit -m "feat: add dashboard stats schema"
```

---

## Task 3: 后端 - 实现 Dashboard 服务（聚合查询 + 词频统计）

**Files:**
- Create: `backend/app/services/dashboard_service.py`

- [ ] **Step 1: 创建 dashboard_service.py**

Create `backend/app/services/dashboard_service.py`:

```python
"""Dashboard 聚合统计服务"""

from __future__ import annotations

import datetime
import logging
import re
from collections import Counter
from typing import Optional

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Collection, Conversation, Document, Message, User
from app.schemas.dashboard import (
    DashboardKPI,
    DashboardStatsResponse,
    DailyCount,
    TopCollectionItem,
    TopQuestionItem,
    TopUserItem,
    TrendData,
)

logger = logging.getLogger(__name__)


# 中文停用词（极简版，覆盖常见功能词）
STOP_WORDS = {
    "的", "了", "是", "在", "我", "你", "他", "她", "它", "们",
    "和", "与", "或", "但", "而", "把", "被", "对", "从", "到",
    "为", "于", "以", "及", "等", "之", "其", "此", "那", "哪",
    "什么", "怎么", "如何", "怎样", "为什么", "可以", "不能",
    "吗", "呢", "啊", "吧", "哦", "嗯", "哈", "呀", "嘛", "啦",
    "请", "帮我", "一个", "一下", "一些", "这个", "那个", "这些", "那些",
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "to", "of", "in", "on", "at", "by", "for", "with", "and", "or",
}


class DashboardService:
    """Dashboard 聚合统计服务"""

    def __init__(self, db: AsyncSession, current_user: User):
        self.db = db
        self.current_user = current_user
        self.is_admin = current_user.role == "admin"

    def _range_start(self, days: int) -> datetime.datetime:
        """计算时间范围起点"""
        now = datetime.datetime.now(datetime.timezone.utc)
        return now - datetime.timedelta(days=days)

    async def get_stats(self, days: int = 7) -> DashboardStatsResponse:
        """获取 Dashboard 统计"""
        start = self._range_start(days)
        today_start = datetime.datetime.now(datetime.timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        now = datetime.datetime.now(datetime.timezone.utc)

        # 并行查询各项数据
        kpi = await self._get_kpi(start, today_start)
        trends = await self._get_trends(start, days)
        top_collections = await self._get_top_collections(start)
        top_users = await self._get_top_users(start) if self.is_admin else None
        top_questions = await self._get_top_questions(start)

        return DashboardStatsResponse(
            scope="admin" if self.is_admin else "user",
            range_days=days,
            generated_at=now,
            kpi=kpi,
            trends=trends,
            top_collections=top_collections,
            top_users=top_users,
            top_questions=top_questions,
        )

    async def _get_kpi(
        self, start: datetime.datetime, today_start: datetime.datetime
    ) -> DashboardKPI:
        """获取 KPI 数据"""
        # 用户/KB/文档 全站统计（全站范围）
        total_users = (await self.db.execute(
            select(func.count(User.id))
        )).scalar() or 0
        total_collections = (await self.db.execute(
            select(func.count(Collection.id))
        )).scalar() or 0
        total_documents = (await self.db.execute(
            select(func.count(Document.id))
        )).scalar() or 0

        # 消息/对话 按范围统计（admin 看全站，user 看个人）
        if self.is_admin:
            msg_q = select(func.count(Message.id)).where(Message.created_at >= start)
            conv_q = select(func.count(Conversation.id)).where(Conversation.created_at >= start)
        else:
            msg_q = select(func.count(Message.id)).where(
                and_(Message.created_at >= start, Message.user_id == self.current_user.id)
            )
            conv_q = select(func.count(Conversation.id)).where(
                and_(
                    Conversation.created_at >= start,
                    Conversation.user_id == self.current_user.id,
                )
            )

        total_messages = (await self.db.execute(msg_q)).scalar() or 0
        total_conversations = (await self.db.execute(conv_q)).scalar() or 0

        # 今日消息
        if self.is_admin:
            today_q = select(func.count(Message.id)).where(Message.created_at >= today_start)
        else:
            today_q = select(func.count(Message.id)).where(
                and_(
                    Message.created_at >= today_start,
                    Message.user_id == self.current_user.id,
                )
            )
        today_messages = (await self.db.execute(today_q)).scalar() or 0

        # user 范围：用户数固定为 1
        if not self.is_admin:
            total_users = 1

        return DashboardKPI(
            total_users=total_users,
            total_collections=total_collections,
            total_documents=total_documents,
            total_conversations=total_conversations,
            total_messages=total_messages,
            today_messages=today_messages,
        )

    async def _get_trends(
        self, start: datetime.datetime, days: int
    ) -> TrendData:
        """获取趋势数据"""
        # 每日消息数（user 角色）
        msg_base = select(
            func.date(Message.created_at).label("date"),
            func.count(Message.id).label("count"),
        ).where(
            and_(Message.role == "user", Message.created_at >= start)
        )
        if not self.is_admin:
            msg_base = msg_base.where(Message.user_id == self.current_user.id)
        msg_base = msg_base.group_by(func.date(Message.created_at)).order_by("date")

        result = await self.db.execute(msg_base)
        daily_messages = [
            DailyCount(date=str(row.date), count=row.count)
            for row in result.all()
        ]

        # 每日文档数（仅 admin）
        daily_documents = []
        if self.is_admin:
            doc_base = select(
                func.date(Document.created_at).label("date"),
                func.count(Document.id).label("count"),
            ).where(
                Document.created_at >= start
            ).group_by(func.date(Document.created_at)).order_by("date")
            result = await self.db.execute(doc_base)
            daily_documents = [
                DailyCount(date=str(row.date), count=row.count)
                for row in result.all()
            ]

        return TrendData(
            daily_messages=_fill_missing_dates(daily_messages, days),
            daily_documents=_fill_missing_dates(daily_documents, days),
        )

    async def _get_top_collections(
        self, start: datetime.datetime
    ) -> list[TopCollectionItem]:
        """获取热门知识库"""
        limit = 10 if self.is_admin else 5

        # 子查询：每个 KB 在范围内的问答数
        msg_sub = (
            select(
                Conversation.collection_id.label("collection_id"),
                func.count(Message.id).label("question_count"),
            )
            .join(Message, Message.conversation_id == Conversation.id)
            .where(
                and_(Message.role == "user", Message.created_at >= start)
            )
            .group_by(Conversation.collection_id)
            .subquery()
        )

        base = (
            select(
                Collection.id,
                Collection.name,
                Collection.document_count,
                Collection.owner_id,
                User.username,
                func.coalesce(msg_sub.c.question_count, 0).label("question_count"),
            )
            .outerjoin(msg_sub, msg_sub.c.collection_id == Collection.id)
            .outerjoin(User, User.id == Collection.owner_id)
        )

        # user 范围：只统计可访问的 KB
        if not self.is_admin:
            from app.models.acl import CollectionACL
            base = base.join(
                CollectionACL,
                and_(
                    CollectionACL.collection_id == Collection.id,
                    CollectionACL.user_id == self.current_user.id,
                ),
            )

        base = base.order_by(func.coalesce(msg_sub.c.question_count, 0).desc()).limit(limit)

        result = await self.db.execute(base)
        return [
            TopCollectionItem(
                id=row.id,
                name=row.name,
                question_count=row.question_count,
                document_count=row.document_count or 0,
                owner_username=row.username,
            )
            for row in result.all()
        ]

    async def _get_top_users(
        self, start: datetime.datetime
    ) -> list[TopUserItem]:
        """获取活跃用户（仅 admin）"""
        base = (
            select(
                User.id,
                User.username,
                User.display_name,
                func.count(func.distinct(Message.id)).label("message_count"),
                func.count(func.distinct(Conversation.id)).label("conversation_count"),
            )
            .outerjoin(Message, and_(
                Message.user_id == User.id,
                Message.created_at >= start,
            ))
            .outerjoin(Conversation, and_(
                Conversation.user_id == User.id,
                Conversation.created_at >= start,
            ))
            .group_by(User.id)
            .order_by(func.count(func.distinct(Message.id)).desc())
            .limit(10)
        )

        result = await self.db.execute(base)
        items = []
        for row in result.all():
            if row.message_count == 0 and row.conversation_count == 0:
                continue
            items.append(TopUserItem(
                user_id=row.id,
                username=row.username,
                display_name=row.display_name,
                message_count=row.message_count,
                conversation_count=row.conversation_count,
            ))
        return items[:10]

    async def _get_top_questions(
        self, start: datetime.datetime
    ) -> list[TopQuestionItem]:
        """获取高频问题（简单词频统计）"""
        limit_n = 20 if self.is_admin else 10

        # 取最近 N 条 user 消息
        msg_q = (
            select(Message.content, Message.created_at)
            .where(and_(Message.role == "user", Message.created_at >= start))
            .order_by(Message.created_at.desc())
            .limit(5000)
        )
        if not self.is_admin:
            msg_q = msg_q.where(Message.user_id == self.current_user.id)

        result = await self.db.execute(msg_q)
        rows = result.all()

        # 词频统计
        word_counter: Counter = Counter()
        last_seen: dict[str, datetime.datetime] = {}
        for content, created_at in rows:
            words = _tokenize(content or "")
            for word in words:
                word_counter[word] += 1
                if word not in last_seen or created_at > last_seen[word]:
                    last_seen[word] = created_at

        # 取 Top
        top_words = word_counter.most_common(limit_n)
        return [
            TopQuestionItem(
                query=word,
                count=count,
                last_asked_at=last_seen.get(word),
            )
            for word, count in top_words
            if count >= 2  # 至少出现 2 次
        ]


def _tokenize(text: str) -> list[str]:
    """简单分词：中文字符 n-gram + 英文分词"""
    if not text:
        return []
    text = text.strip().lower()

    # 去除标点
    text = re.sub(r"[^\w\s\u4e00-\u9fff]+", " ", text)

    tokens = []
    # 提取英文/数字单词
    en_words = re.findall(r"[a-z0-9]+", text)
    for w in en_words:
        if len(w) >= 2 and w not in STOP_WORDS:
            tokens.append(w)

    # 中文：2-4 字 n-gram
    cn_text = re.sub(r"[a-z0-9\s]+", " ", text)
    cn_chars = [c for c in cn_text if "\u4e00" <= c <= "\u9fff"]
    for n in (2, 3, 4):
        for i in range(len(cn_chars) - n + 1):
            gram = "".join(cn_chars[i : i + n])
            if gram not in STOP_WORDS:
                tokens.append(gram)

    return tokens


def _fill_missing_dates(items: list[DailyCount], days: int) -> list[DailyCount]:
    """补全缺失日期（保证趋势图连续）"""
    if not items:
        return items

    today = datetime.date.today()
    expected_dates = {(today - datetime.timedelta(days=i)).isoformat() for i in range(days)}
    existing = {item.date: item.count for item in items}

    result = []
    for i in range(days - 1, -1, -1):
        d = (today - datetime.timedelta(days=i)).isoformat()
        result.append(DailyCount(date=d, count=existing.get(d, 0)))

    return result
```

- [ ] **Step 2: 验证服务可以导入**

Run:
```bash
cd d:\workspace\knowledge_base\backend
.venv\Scripts\python -c "from app.services.dashboard_service import DashboardService; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd d:\workspace\knowledge_base
git add backend/app/services/dashboard_service.py
git commit -m "feat: add dashboard aggregation service"
```

---

## Task 4: 后端 - 新增 Dashboard API endpoint

**Files:**
- Create: `backend/app/api/dashboard.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 创建 dashboard API 文件**

Create `backend/app/api/dashboard.py`:

```python
"""Dashboard 统计 API"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_current_user
from app.models.database import get_db
from app.models.document import User
from app.schemas.dashboard import DashboardStatsResponse
from app.services.dashboard_service import DashboardService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    days: int = Query(7, ge=1, le=90, description="时间范围（天）"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取 Dashboard 统计数据

    - 管理员（admin）：返回全站统计
    - 普通用户：仅返回个人相关统计
    """
    service = DashboardService(db, current_user)
    return await service.get_stats(days=days)
```

- [ ] **Step 2: 在 main.py 中注册 router**

打开 `backend/app/main.py`，找到 router 注册的位置（搜索 `include_router` 或 `app.include_router`），在适当位置添加：

```python
from app.api.dashboard import router as dashboard_router
```

然后找到 router 注册列表（例如 `app.include_router(...)`），添加：

```python
app.include_router(dashboard_router)
```

提示：如果项目已有集中注册 router 的地方（如 `app/api/__init__.py`），在该文件中也添加对应引用。

- [ ] **Step 3: 验证 API 可路由**

Run:
```bash
cd d:\workspace\knowledge_base\backend
.venv\Scripts\python -c "from app.main import app; routes = [r.path for r in app.routes if hasattr(r, 'path') and 'dashboard' in r.path]; print(routes)"
```

Expected: 包含 `['/api/v1/dashboard/stats']`

- [ ] **Step 4: Commit**

```bash
cd d:\workspace\knowledge_base
git add backend/app/api/dashboard.py backend/app/main.py
git commit -m "feat: add dashboard stats API endpoint"
```

---

## Task 5: 前端 - 安装 Recharts 依赖

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: 安装 recharts**

Run:
```bash
cd d:\workspace\knowledge_base\frontend
npm install recharts
```

Expected: 安装成功

- [ ] **Step 2: Commit**

```bash
cd d:\workspace\knowledge_base
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add recharts dependency for dashboard"
```

---

## Task 6: 前端 - 新增 Dashboard 类型和 API 方法

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: 在 types/index.ts 中新增类型**

打开 `frontend/src/types/index.ts`，在文件末尾添加：

```typescript
// ===== Dashboard 统计 =====

export interface DashboardKPI {
  total_users: number;
  total_collections: number;
  total_documents: number;
  total_conversations: number;
  total_messages: number;
  today_messages: number;
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface DashboardTrends {
  daily_messages: DailyCount[];
  daily_documents: DailyCount[];
}

export interface TopCollectionItem {
  id: string;
  name: string;
  question_count: number;
  document_count: number;
  owner_username?: string | null;
}

export interface TopUserItem {
  user_id: string;
  username: string;
  display_name?: string | null;
  message_count: number;
  conversation_count: number;
}

export interface TopQuestionItem {
  query: string;
  count: number;
  last_asked_at?: string | null;
}

export interface DashboardStats {
  scope: "admin" | "user";
  range_days: number;
  generated_at: string;
  kpi: DashboardKPI;
  trends: DashboardTrends;
  top_collections: TopCollectionItem[];
  top_users: TopUserItem[] | null;
  top_questions: TopQuestionItem[];
}
```

- [ ] **Step 2: 在 api.ts 中新增方法**

打开 `frontend/src/lib/api.ts`：

1. 在顶部 import 类型列表中，添加：
```typescript
  DashboardStats,
```

2. 在 `listAuditLogs` 方法之后，添加：
```typescript
  // Dashboard
  async getDashboardStats(days: number = 7): Promise<DashboardStats> {
    return this.request<DashboardStats>(`/api/v1/dashboard/stats?days=${days}`);
  }
```

- [ ] **Step 3: 验证类型**

Run:
```bash
cd d:\workspace\knowledge_base\frontend
npx tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
cd d:\workspace\knowledge_base
git add frontend/src/types/index.ts frontend/src/lib/api.ts
git commit -m "feat: add dashboard types and API method"
```

---

## Task 7: 前端 - 创建 Dashboard 基础组件

**Files:**
- Create: `frontend/src/components/dashboard/RangeSelector.tsx`
- Create: `frontend/src/components/dashboard/KpiCards.tsx`
- Create: `frontend/src/components/dashboard/DashboardHeader.tsx`
- Create: `frontend/src/components/dashboard/DashboardSkeleton.tsx`

- [ ] **Step 1: 创建 RangeSelector 组件**

Create `frontend/src/components/dashboard/RangeSelector.tsx`:

```tsx
"use client";

interface Props {
  value: number;
  onChange: (days: number) => void;
}

const options = [
  { value: 7, label: "近 7 天" },
  { value: 30, label: "近 30 天" },
  { value: 90, label: "近 90 天" },
];

export default function RangeSelector({ value, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
            value === opt.value
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 创建 KpiCards 组件**

Create `frontend/src/components/dashboard/KpiCards.tsx`:

```tsx
"use client";

import { Users, Database, FileText, MessageSquare } from "lucide-react";
import type { DashboardKPI } from "@/types";

interface Props {
  kpi: DashboardKPI;
  scope: "admin" | "user";
}

const cards = [
  {
    key: "total_users",
    label: "用户",
    Icon: Users,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
  },
  {
    key: "total_collections",
    label: "知识库",
    Icon: Database,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
  },
  {
    key: "total_documents",
    label: "文档",
    Icon: FileText,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
  {
    key: "total_messages",
    label: "问答消息",
    Icon: MessageSquare,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
] as const;

function formatNumber(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}K`;
  return n.toString();
}

export default function KpiCards({ kpi, scope }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.Icon;
        const value = kpi[card.key as keyof DashboardKPI] as number;
        return (
          <div
            key={card.key}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.iconBg}`}>
                <Icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
              {card.key === "total_messages" && kpi.today_messages > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  今日 {kpi.today_messages}
                </span>
              )}
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold text-slate-900">{formatNumber(value)}</p>
              <p className="mt-1 text-sm text-slate-500">
                {card.label}
                {scope === "user" && card.key === "total_users" && " (本人)"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: 创建 DashboardHeader 组件**

Create `frontend/src/components/dashboard/DashboardHeader.tsx`:

```tsx
"use client";

import { RefreshCw } from "lucide-react";

interface Props {
  scope: "admin" | "user";
  rangeDays: number;
  onRefresh: () => void;
  loading: boolean;
}

export default function DashboardHeader({ scope, rangeDays, onRefresh, loading }: Props) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - rangeDays + 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          {scope === "admin" ? "全站数据" : "我的数据"} · {fmt(start)} 至 {fmt(today)}
        </p>
      </div>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-all"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        刷新
      </button>
    </div>
  );
}
```

- [ ] **Step 4: 创建 DashboardSkeleton 组件**

Create `frontend/src/components/dashboard/DashboardSkeleton.tsx`:

```tsx
export default function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* KPI 卡片 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="h-11 w-11 rounded-xl bg-slate-100" />
            <div className="mt-4 h-8 w-20 rounded bg-slate-100" />
            <div className="mt-2 h-4 w-16 rounded bg-slate-100" />
          </div>
        ))}
      </div>
      {/* 图表区 */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-80 rounded-2xl border border-slate-200 bg-white lg:col-span-2" />
        <div className="h-80 rounded-2xl border border-slate-200 bg-white" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-80 rounded-2xl border border-slate-200 bg-white" />
        <div className="h-80 rounded-2xl border border-slate-200 bg-white" />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd d:\workspace\knowledge_base
git add frontend/src/components/dashboard/
git commit -m "feat: add dashboard base components (header, kpi, range, skeleton)"
```

---

## Task 8: 前端 - 创建 TrendChart 组件

**Files:**
- Create: `frontend/src/components/dashboard/TrendChart.tsx`

- [ ] **Step 1: 创建 TrendChart 组件**

Create `frontend/src/components/dashboard/TrendChart.tsx`:

```tsx
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";
import type { DashboardTrends } from "@/types";

interface Props {
  trends: DashboardTrends;
  showDocuments: boolean;
}

export default function TrendChart({ trends, showDocuments }: Props) {
  // 合并数据
  const dataMap = new Map<string, { date: string; messages: number; documents: number }>();
  for (const m of trends.daily_messages) {
    dataMap.set(m.date, { date: m.date, messages: m.count, documents: 0 });
  }
  for (const d of trends.daily_documents) {
    const existing = dataMap.get(d.date) || { date: d.date, messages: 0, documents: 0 };
    existing.documents = d.count;
    dataMap.set(d.date, existing);
  }
  const data = Array.from(dataMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const hasData = data.some((d) => d.messages > 0 || d.documents > 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
          <TrendingUp className="h-4 w-4 text-blue-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">使用趋势</h3>
      </div>

      {!hasData ? (
        <div className="flex h-72 items-center justify-center text-sm text-slate-400">
          暂无数据
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={288}>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="msgGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              stroke="#94a3b8"
              fontSize={11}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis stroke="#94a3b8" fontSize={11} />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="messages"
              name="问答数"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            {showDocuments && (
              <Line
                type="monotone"
                dataKey="documents"
                name="文档上传"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd d:\workspace\knowledge_base
git add frontend/src/components/dashboard/TrendChart.tsx
git commit -m "feat: add TrendChart component"
```

---

## Task 9: 前端 - 创建 TopCollections 和 TopUsers 组件

**Files:**
- Create: `frontend/src/components/dashboard/TopCollections.tsx`
- Create: `frontend/src/components/dashboard/TopUsers.tsx`

- [ ] **Step 1: 创建 TopCollections 组件**

Create `frontend/src/components/dashboard/TopCollections.tsx`:

```tsx
"use client";

import { Database } from "lucide-react";
import type { TopCollectionItem } from "@/types";

interface Props {
  items: TopCollectionItem[];
}

export default function TopCollections({ items }: Props) {
  const maxCount = Math.max(...items.map((i) => i.question_count), 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50">
          <Database className="h-4 w-4 text-violet-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">热门知识库</h3>
      </div>

      {items.length === 0 ? (
        <div className="flex h-72 items-center justify-center text-sm text-slate-400">
          暂无数据
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => {
            const pct = (item.question_count / maxCount) * 100;
            return (
              <div key={item.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600">
                      {idx + 1}
                    </span>
                    <span className="truncate font-medium text-slate-900">{item.name}</span>
                    {item.owner_username && (
                      <span className="shrink-0 text-xs text-slate-400">
                        @{item.owner_username}
                      </span>
                    )}
                  </div>
                  <span className="ml-2 shrink-0 text-sm font-semibold text-violet-600">
                    {item.question_count}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-600 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 TopUsers 组件**

Create `frontend/src/components/dashboard/TopUsers.tsx`:

```tsx
"use client";

import { Users } from "lucide-react";
import type { TopUserItem } from "@/types";

interface Props {
  items: TopUserItem[];
}

function avatarColor(name: string): string {
  const colors = [
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-violet-100 text-violet-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function TopUsers({ items }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
          <Users className="h-4 w-4 text-blue-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">活跃用户 Top 10</h3>
      </div>

      {items.length === 0 ? (
        <div className="flex h-72 items-center justify-center text-sm text-slate-400">
          暂无数据
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((user, idx) => {
            const display = user.display_name || user.username;
            const initial = display.charAt(0).toUpperCase();
            return (
              <div
                key={user.user_id}
                className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50 transition-colors"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600">
                  {idx + 1}
                </span>
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarColor(display)}`}
                >
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{display}</p>
                  <p className="truncate text-xs text-slate-500">@{user.username}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-blue-600">{user.message_count}</p>
                  <p className="text-xs text-slate-400">{user.conversation_count} 对话</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd d:\workspace\knowledge_base
git add frontend/src/components/dashboard/TopCollections.tsx frontend/src/components/dashboard/TopUsers.tsx
git commit -m "feat: add TopCollections and TopUsers components"
```

---

## Task 10: 前端 - 创建 TopQuestions 组件

**Files:**
- Create: `frontend/src/components/dashboard/TopQuestions.tsx`

- [ ] **Step 1: 创建 TopQuestions 组件**

Create `frontend/src/components/dashboard/TopQuestions.tsx`:

```tsx
"use client";

import { Search } from "lucide-react";
import type { TopQuestionItem } from "@/types";

interface Props {
  items: TopQuestionItem[];
}

export default function TopQuestions({ items }: Props) {
  const maxCount = Math.max(...items.map((i) => i.count), 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
          <Search className="h-4 w-4 text-emerald-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">高频问题</h3>
      </div>

      {items.length === 0 ? (
        <div className="flex h-72 items-center justify-center text-sm text-slate-400">
          暂无数据
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => {
            // 字号随频次变化（基于最大值的对数缩放）
            const size = 12 + Math.round((item.count / maxCount) * 12);
            const intensity = item.count / maxCount;
            const bgClass =
              intensity > 0.7
                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                : intensity > 0.4
                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                : "bg-slate-50 text-slate-700 border-slate-200";
            return (
              <div
                key={item.query}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 transition-all hover:shadow-sm cursor-default ${bgClass}`}
                style={{ fontSize: `${size}px` }}
                title={`出现 ${item.count} 次${item.last_asked_at ? `，最近 ${new Date(item.last_asked_at).toLocaleDateString("zh-CN")}` : ""}`}
              >
                <span className="font-medium">{item.query}</span>
                <span className="text-xs opacity-70">×{item.count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd d:\workspace\knowledge_base
git add frontend/src/components/dashboard/TopQuestions.tsx
git commit -m "feat: add TopQuestions component"
```

---

## Task 11: 前端 - 创建 Dashboard 主页面

**Files:**
- Create: `frontend/src/app/dashboard/page.tsx`

- [ ] **Step 1: 创建 dashboard 页面**

Create `frontend/src/app/dashboard/page.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Layout from "@/components/Layout";
import type { DashboardStats } from "@/types";
import { AlertCircle } from "lucide-react";

import DashboardHeader from "@/components/dashboard/DashboardHeader";
import RangeSelector from "@/components/dashboard/RangeSelector";
import KpiCards from "@/components/dashboard/KpiCards";
import TrendChart from "@/components/dashboard/TrendChart";
import TopCollections from "@/components/dashboard/TopCollections";
import TopUsers from "@/components/dashboard/TopUsers";
import TopQuestions from "@/components/dashboard/TopQuestions";
import DashboardSkeleton from "@/components/dashboard/DashboardSkeleton";

export default function DashboardPage() {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStats = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError("");
      const data = await api.getDashboardStats(days);
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadStats();
    }
  }, [authLoading, isAuthenticated, loadStats]);

  if (authLoading) return null;

  const isAdmin = user?.role === "admin";

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <DashboardHeader
          scope={stats?.scope || (isAdmin ? "admin" : "user")}
          rangeDays={days}
          onRefresh={() => loadStats(false)}
          loading={loading && !!stats}
        />

        <div className="mb-6">
          <RangeSelector value={days} onChange={setDays} />
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-100 p-3.5 text-sm text-red-600 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
            <button
              onClick={() => loadStats()}
              className="ml-auto text-xs font-medium text-red-700 hover:underline"
            >
              重试
            </button>
          </div>
        )}

        {loading && !stats ? (
          <DashboardSkeleton />
        ) : stats ? (
          <div className="space-y-6">
            <KpiCards kpi={stats.kpi} scope={stats.scope} />

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <TrendChart trends={stats.trends} showDocuments={stats.scope === "admin"} />
              </div>
              <TopCollections items={stats.top_collections} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {stats.scope === "admin" && stats.top_users && (
                <TopUsers items={stats.top_users} />
              )}
              {stats.scope === "user" && (
                <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 shadow-sm flex flex-col items-center justify-center text-center">
                  <div className="text-3xl mb-2">📊</div>
                  <p className="text-sm font-medium text-slate-700">
                    你贡献了 {stats.kpi.total_messages} 条问答消息
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    继续保持，知识库会越来越丰富
                  </p>
                </div>
              )}
              <TopQuestions items={stats.top_questions} />
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
```

- [ ] **Step 2: 验证类型**

Run:
```bash
cd d:\workspace\knowledge_base\frontend
npx tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
cd d:\workspace\knowledge_base
git add frontend/src/app/dashboard/page.tsx
git commit -m "feat: add dashboard page with role-based rendering"
```

---

## Task 12: 验证与端到端测试

- [ ] **Step 1: 验证后端编译和路由**

Run:
```bash
cd d:\workspace\knowledge_base\backend
.venv\Scripts\python -c "from app.main import app; routes = [r.path for r in app.routes if hasattr(r, 'path') and 'dashboard' in r.path]; print(routes)"
```

Expected: `['/api/v1/dashboard/stats']`

- [ ] **Step 2: 验证前端编译**

Run:
```bash
cd d:\workspace\knowledge_base\frontend
npx tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 3: 端到端测试清单**

启动后端和前端后：
1. 用 admin 账号登录
2. 访问 `/dashboard`，确认显示全站 Dashboard（4 个 KPI + 趋势 + Top 知识库 + Top 用户 + 高频问题）
3. 切换时间范围 7/30/90 天，确认数据更新
4. 点击刷新按钮，确认重新加载
5. 退出登录，用普通用户登录
6. 访问 `/dashboard`，确认显示个人 Dashboard（无 TopUsers，TopCollections 只显示自己可访问的 KB）
7. 访问 `/knowledge-bases`，确认原来的知识库列表页面正常显示
8. 侧栏导航点击"知识库"，确认跳转到 `/knowledge-bases`

- [ ] **Step 4: 最终提交**

```bash
cd d:\workspace\knowledge_base
git add -A
git commit -m "feat: complete admin dashboard feature"
```

---

## 附录：Spec 覆盖检查

| 设计文档需求 | 对应任务 | 状态 |
|-------------|---------|------|
| 路径规划（重命名 /dashboard） | Task 1 | ✅ |
| Dashboard schema | Task 2 | ✅ |
| 聚合查询服务 | Task 3 | ✅ |
| Dashboard API endpoint | Task 4 | ✅ |
| Recharts 安装 | Task 5 | ✅ |
| Dashboard 类型和 API 方法 | Task 6 | ✅ |
| KPI 卡片组件 | Task 7 | ✅ |
| 时间范围切换器 | Task 7 | ✅ |
| 趋势折线图 | Task 8 | ✅ |
| 热门知识库列表 | Task 9 | ✅ |
| 活跃用户列表（仅 admin） | Task 9 | ✅ |
| 高频问题标签云 | Task 10 | ✅ |
| Dashboard 主页面（双视角） | Task 11 | ✅ |
| 错误处理 / 空数据 | Task 11 | ✅ |
| 时间范围切换 | Task 7, 11 | ✅ |
| 刷新按钮 | Task 7 | ✅ |
| 验证测试 | Task 12 | ✅ |