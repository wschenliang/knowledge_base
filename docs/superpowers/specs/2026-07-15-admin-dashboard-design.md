# 管理后台 Dashboard 功能设计方案

## 1. 概述

### 1.1 背景

企业知识库系统已有基础的用户交互能力（问答、上传文档、管理 KB），但管理员缺乏全局视角：
- 看不到系统总用户数、总文档数
- 不知道哪些知识库最热门、哪些用户最活跃
- 无法识别高频问题以优化知识库内容

同时普通用户进入 Dashboard 后，也希望看到自己的使用情况（个人知识库活跃度、问答数）。

### 1.2 目标

实现 `/dashboard` 路径下的统一统计面板，按用户角色展示不同内容：

- **管理员视角**：看到全站统计，包括用户排行、知识库排行、高频问题
- **普通用户视角**：仅看到与自己相关的数据（个人活跃度、个人知识库统计）

### 1.3 非目标

- 不实现实时推送（WebSocket）— 刷新页面或点击刷新按钮更新数据
- 不实现数据导出（CSV/Excel）— 留待后续扩展
- 不实现自定义仪表盘布局 — 固定布局即可
- 不引入 NLP 库做关键词提取 — 用简单 SQL 词频统计

---

## 2. 路径规划

⚠️ **路径冲突处理**：现有 `/dashboard` 已被"个人知识库管理"页面占用，需要重命名：

| 旧路径 | 新路径 | 用途 |
|--------|--------|------|
| `/dashboard`（被占用） | `/knowledge-bases` | 个人知识库列表（现有页面迁移） |
| 无 | `/dashboard`（新增） | 统计 Dashboard（新功能） |

**影响范围**：
- `frontend/src/app/dashboard/page.tsx` → 重命名为 `frontend/src/app/knowledge-bases/page.tsx`
- `frontend/src/components/Layout.tsx` 中 `getPageTitle` 的判断
- 侧栏导航"知识库"项的 href 从 `/dashboard` 改为 `/knowledge-bases`

---

## 3. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      前端 (Next.js)                          │
│  /dashboard/page.tsx (按 role 渲染)                          │
│    ├─ admin 视图：KpiCards + TrendChart + TopCollections     │
│    │            + TopUsers + TopQuestions                    │
│    └─ user 视图：KpiCards + TrendChart + MyTopCollections    │
│                  + MyTopQuestions                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                  后端 (FastAPI)              │                │
│  GET /api/v1/dashboard/stats?days=7        │                │
│    ├─ 根据 JWT 解析 role                    │                │
│    ├─ admin → 全站聚合查询                  │                │
│    └─ user  → 个人聚合查询                  │                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                  ┌────────┴────────┐
                  │  PostgreSQL     │
                  │  users / collections / documents / conversations / messages │
                  └─────────────────┘
```

---

## 4. 后端 API 设计

### 4.1 接口

```
GET /api/v1/dashboard/stats?days=7
```

**Query 参数**：
- `days`：时间范围，可选 7 / 30 / 90，默认 7

**权限**：所有登录用户可访问（admin 看全站，普通用户看个人）

**响应统一 schema**（根据 role 字段填充不同字段）：

```json
{
  "scope": "admin",
  "range_days": 7,
  "generated_at": "2026-07-15T10:00:00Z",
  
  "kpi": {
    "total_users": 42,
    "total_collections": 18,
    "total_documents": 156,
    "total_conversations": 89,
    "total_messages": 1230,
    "today_messages": 47
  },
  
  "trends": {
    "daily_messages": [
      {"date": "2026-07-09", "count": 142},
      {"date": "2026-07-10", "count": 167},
      ...
    ],
    "daily_documents": [
      {"date": "2026-07-09", "count": 3},
      ...
    ]
  },
  
  "top_collections": [
    {
      "id": "...",
      "name": "产品手册",
      "question_count": 234,
      "document_count": 12,
      "owner_username": "alice"
    }
  ],
  
  "top_users": [
    {
      "user_id": "...",
      "username": "alice",
      "display_name": "Alice",
      "message_count": 87,
      "conversation_count": 12
    }
  ],
  
  "top_questions": [
    {
      "query": "如何重置密码",
      "count": 23,
      "last_asked_at": "2026-07-15T09:23:00Z"
    }
  ]
}
```

**字段填充规则**：

| 字段 | admin 范围 | user 范围 |
|------|-----------|-----------|
| `scope` | `"admin"` | `"user"` |
| `total_users` | 总用户数 | 固定为 1（自己） |
| `top_collections` | 全站 Top 10 | 自己可访问的 KB 的 Top 5 |
| `top_users` | 全站 Top 10 | **不返回**（null） |
| `top_questions` | 全站 Top 20 | 自己的 Top 10 |
| `total_messages` | 全站 | 自己的 |
| `total_conversations` | 全站 | 自己的 |

### 4.2 SQL 查询设计

**KPI 计数**（一次 6 个聚合查询，可并行）：

```sql
-- 用户总数
SELECT COUNT(*) FROM users;

-- 知识库总数
SELECT COUNT(*) FROM collections;

-- 文档总数
SELECT COUNT(*) FROM documents;

-- 对话总数
SELECT COUNT(*) FROM conversations;

-- 消息总数（指定时间范围）
SELECT COUNT(*) FROM messages WHERE created_at >= :start;

-- 今日消息数
SELECT COUNT(*) FROM messages WHERE created_at >= :today_start;
```

**趋势数据**（按天分组）：

```sql
-- 每日问答数
SELECT DATE(created_at) AS date, COUNT(*) AS count
FROM messages
WHERE role = 'user' AND created_at >= :start
GROUP BY DATE(created_at)
ORDER BY date;

-- 每日上传文档数（admin 范围）
SELECT DATE(created_at) AS date, COUNT(*) AS count
FROM documents
WHERE created_at >= :start
GROUP BY DATE(created_at)
ORDER BY date;
```

**热门知识库**（按问答数聚合）：

```sql
SELECT c.id, c.name, c.document_count, c.owner_id,
       COUNT(DISTINCT m.id) AS question_count
FROM collections c
LEFT JOIN conversations conv ON conv.collection_id = c.id
LEFT JOIN messages m ON m.conversation_id = conv.id 
    AND m.role = 'user' AND m.created_at >= :start
GROUP BY c.id
ORDER BY question_count DESC
LIMIT 10;
```

**活跃用户**（admin 范围）：

```sql
SELECT u.id, u.username, u.display_name,
       COUNT(DISTINCT m.id) AS message_count,
       COUNT(DISTINCT conv.id) AS conversation_count
FROM users u
LEFT JOIN messages m ON m.user_id = u.id 
    AND m.created_at >= :start
LEFT JOIN conversations conv ON conv.user_id = u.id
GROUP BY u.id
HAVING COUNT(DISTINCT m.id) > 0
ORDER BY message_count DESC
LIMIT 10;
```

**高频问题**（简单词频统计）：

```sql
-- 取最近 N 天所有 user 角色消息
SELECT content, created_at
FROM messages
WHERE role = 'user' AND created_at >= :start
ORDER BY created_at DESC
LIMIT 5000;
```

后端在 Python 中对 `content` 做简单处理：
1. 去除标点、转小写
2. 中文按字符 n-gram（2-4 字）切分
3. 英文按空格分词
4. 统计词频，过滤停用词
5. 返回 Top 20

---

## 5. 前端组件设计

### 5.1 页面结构

`frontend/src/app/dashboard/page.tsx`：
- 根据 `useAuth()` 获取当前用户 role
- 请求一次 `/api/v1/dashboard/stats`
- 根据 `response.scope` 决定渲染 admin 版还是 user 版组件树

### 5.2 组件清单

| 组件 | 路径 | 职责 |
|------|------|------|
| `KpiCards` | `components/dashboard/KpiCards.tsx` | 顶部 4 个数字 + 同比箭头 |
| `RangeSelector` | `components/dashboard/RangeSelector.tsx` | 7/30/90 天切换 |
| `TrendChart` | `components/dashboard/TrendChart.tsx` | Recharts 折线图（双 Y 轴） |
| `TopCollections` | `components/dashboard/TopCollections.tsx` | 热门知识库列表 + 进度条 |
| `TopUsers` | `components/dashboard/TopUsers.tsx` | 活跃用户列表（仅 admin） |
| `TopQuestions` | `components/dashboard/TopQuestions.tsx` | 高频问题标签云 + 计数 |
| `DashboardSkeleton` | `components/dashboard/DashboardSkeleton.tsx` | 加载占位 |
| `DashboardHeader` | `components/dashboard/DashboardHeader.tsx` | 页面标题 + 刷新按钮 |

### 5.3 布局

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard                                  [刷新]            │
│  全站数据 · 2026-07-09 至 2026-07-15                         │
├─────────────────────────────────────────────────────────────┤
│  时间范围: [●近 7 天  ○近 30 天  ○近 90 天]                  │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┬──────────┬──────────┬──────────┐              │
│  │ 用户      │ 知识库   │ 文档     │ 问答      │  ← KpiCards  │
│  │  42       │  18      │  156     │  1.2K    │              │
│  │ ↑ 12%    │ ↑ 3      │ ↑ 24     │ ↑ 18%    │              │
│  └──────────┴──────────┴──────────┴──────────┘              │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────┬────────────────────────┐    │
│  │ 使用趋势                    │ 热门知识库 Top 5        │    │
│  │ [折线图: 问答/文档]          │ [列表 + 进度条]         │    │
│  │                             │                        │    │
│  └────────────────────────────┴────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────┬────────────────────────┐    │
│  │ 活跃用户 Top 10 (admin)     │ 高频问题 Top 20         │    │
│  │ [用户列表]                  │ [标签云 + 计数]         │    │
│  │ 或                         │                        │    │
│  │ 我的知识库 (user)           │                        │    │
│  └────────────────────────────┴────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 视觉风格

与项目现有 UI 统一：

- **背景**：`bg-slate-50`（页面）+ `bg-white`（卡片）
- **卡片**：`rounded-2xl border border-slate-200 shadow-sm`
- **KPI 卡片强调色**：
  - 用户 → `bg-blue-50` 图标 + `text-blue-600`
  - 知识库 → `bg-violet-50` 图标 + `text-violet-600`
  - 文档 → `bg-emerald-50` 图标 + `text-emerald-600`
  - 问答 → `bg-amber-50` 图标 + `text-amber-600`
- **数字字体**：`text-3xl font-bold text-slate-900`
- **同比箭头**：`text-emerald-600`（上涨）/`text-rose-600`（下降）

**Recharts 配色**：
- 问答趋势：`#3b82f6`（蓝）
- 文档趋势：`#10b981`（绿）
- 柱状图：`#6366f1`（靛蓝）

---

## 6. 错误处理与交互

| 场景 | 处理 |
|------|------|
| 接口 500 | 顶部红色错误条 + 重试按钮 |
| 数据加载中 | Skeleton 骨架屏（4 个卡片 + 图表占位） |
| 数据为空（无问答记录） | 显示"暂无数据"文案，跳过图表渲染 |
| 时间范围切换 | 平滑过渡（loading 状态切换） |
| 刷新按钮 | 旋转动画 + 重新请求 |
| 普通用户访问 | 自动渲染个人版 Dashboard，无 admin 字段 |
| admin 字段缺失（user 范围） | 前端判断 `scope === 'admin'` 才显示 TopUsers 组件 |

---

## 7. 性能考虑

1. **单次请求**：通过单一聚合 API 减少请求次数
2. **SQL 索引**：现有 `created_at` 索引可支撑 GROUP BY 查询
3. **分页/限制**：高频问题统计仅取最近 5000 条消息，避免全表扫描
4. **前端缓存**：暂不引入 SWR/React Query，每次切换时间范围重新请求
5. **数据后端缓存**：暂不引入 Redis（YAGNI）

---

## 8. 新增依赖

**前端**：

```json
{
  "recharts": "^2.13.0"
}
```

**后端**：无新增依赖

---

## 9. 数据库变更

无需变更，复用现有表：
- `users` / `collections` / `documents` / `conversations` / `messages`
- 现有索引：`messages.created_at`、`messages.role` 等
- `messages.content` 字段用于高频问题统计（无需额外索引，因为 LIMIT 5000）

---

## 10. 安全考虑

1. **权限校验**：所有登录用户可访问，但后端根据 role 返回不同字段
2. **数据脱敏**：普通用户看不到其他用户信息
3. **SQL 注入**：所有查询使用 SQLAlchemy 参数化查询
4. **限流**：暂不实现，依赖后端通用限流（如果有）

---

## 11. 测试要点

1. **admin 视图**：所有 5 个 section（KPI + 趋势 + 知识库 + 用户 + 问题）正常显示
2. **user 视图**：4 个 section（KPI + 趋势 + 个人知识库 + 个人问题），无 TopUsers
3. **空数据**：新部署系统时显示合理的空状态
4. **时间范围切换**：7→30→90 天切换流畅
5. **权限边界**：普通用户不能通过修改请求参数绕过限制

---

## 12. 未来扩展

- 数据导出（CSV/Excel）
- 自定义时间范围
- 仪表盘拖拽布局
- 实时刷新（WebSocket / SSE）
- 更智能的问题聚类（引入 NLP 库）
- 性能优化：Redis 缓存 + Celery 后台聚合任务