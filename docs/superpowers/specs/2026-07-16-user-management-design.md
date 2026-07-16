# 用户管理后台设计方案

> 文档日期：2026-07-16
> 项目：CogniBase 企业知识库智能问答系统

---

## 1. 需求概述

### 1.1 背景

CogniBase 目前已实现用户注册/登录、细粒度权限控制（ACL）、审计日志、Dashboard 数据概览等能力。管理员可以通过 `/admin/dashboard` 查看平台统计数据，通过 `/audit-logs` 查看操作审计日志，但**缺乏用户管理后台**——管理员无法查看用户列表、禁用账号、重置密码、调整用户角色。

### 1.2 目标

为管理员提供完整的用户管理后台，支持：

1. **查看用户列表**：分页展示所有注册用户，支持多维度筛选与搜索
2. **查看用户详情**：查看单个用户的详细信息及平台使用统计
3. **禁用/启用账号**：管理员可主动禁用违规账号或恢复已禁用账号
4. **角色管理**：将普通用户提升为管理员，或降级为普通用户
5. **重置密码**：管理员触发密码重置邮件，用户通过邮件链接自助重置
6. **操作审计**：所有用户管理操作自动记录审计日志

### 1.3 约束

- 用户模型已存在 `role`（user/admin）和 `is_active`（bool）字段，无需数据库迁移
- 注册时邮箱为必填字段，重置密码邮件可保证送达
- 遵循现有代码风格：后端 FastAPI + SQLAlchemy 异步，前端 Next.js + Tailwind CSS
- 复用现有 `require_admin` 权限守卫和审计日志系统

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (Next.js)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ /admin/users │  │/reset-password│  │ 侧边栏导航新增入口    │  │
│  │  用户管理页   │  │  密码重置页   │  │                     │  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────┘  │
│         │                │                                    │
│         └────────────────┼────────────────────────────────────┘
│                          │  HTTP / REST API
├──────────────────────────┼────────────────────────────────────┤
│                        后端 (FastAPI)                        │
│  ┌───────────────────────┴───────────────────────────────┐  │
│  │              /api/v1/admin/* (admin.py)                │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐  │  │
│  │  │用户列表  │ │用户详情  │ │更新用户  │ │重置密码邮件   │  │  │
│  │  │ GET     │ │ GET     │ │ PUT     │ │ POST        │  │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌────────────────────────┐  ┌────────────────────────────┐  │
│  │  EmailService          │  │  AuditService              │  │
│  │  (aiosmtplib 异步邮件)  │  │  (现有审计日志服务)         │  │
│  └────────────────────────┘  └────────────────────────────┘  │
│  ┌────────────────────────┐  ┌────────────────────────────┐  │
│  │  User (SQLAlchemy)     │  │  require_admin (权限守卫)    │  │
│  │  role / is_active     │  │  (现有，复用)               │  │
│  └────────────────────────┘  └────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 后端框架 | FastAPI + SQLAlchemy 2.0 (async) | 与现有代码一致 |
| 邮件发送 | aiosmtplib | 异步 SMTP 客户端，支持 TLS/SSL |
| 权限守卫 | `require_admin` (现有) | 复用现有管理员权限校验 |
| 审计日志 | `AuditService` (现有) | 复用现有审计日志服务 |
| 前端框架 | Next.js 16 + React 19 + TypeScript | 与现有代码一致 |
| UI 样式 | Tailwind CSS 4 + lucide-react | 与现有代码一致 |
| 状态管理 | React useState/useCallback | 与审计日志页面一致，无需引入新库 |

---

## 3. 后端 API 设计

### 3.1 端点清单

所有端点统一挂载在 `/api/v1/admin` 前缀下，受 `require_admin` 守卫保护。

| 端点 | 方法 | 说明 | 请求体 | 响应 |
|------|------|------|--------|------|
| `/users` | GET | 分页查询用户列表 | Query 参数 | `UserListResponse` |
| `/users/{user_id}` | GET | 查看用户详情 | - | `UserDetailResponse` |
| `/users/{user_id}` | PUT | 更新用户信息 | `UserUpdateRequest` | `UserDetailResponse` |
| `/users/{user_id}/toggle-status` | POST | 禁用/启用切换 | - | `UserDetailResponse` |
| `/users/{user_id}/reset-password` | POST | 发送重置密码邮件 | - | `{"message": "邮件已发送"}` |
| `/users/stats` | GET | 用户统计（总用户数/活跃数/管理员数/今日新增） | - | `UserStatsResponse` |

### 3.2 请求/响应模型

```python
# backend/app/schemas/admin.py (新增)

from pydantic import BaseModel, Field
from typing import Optional
import datetime


class UserListItem(BaseModel):
    """用户列表项（不含敏感信息）"""
    id: str
    username: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: str
    is_active: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    """用户列表响应"""
    items: list[UserListItem]
    total: int


class UserUpdateRequest(BaseModel):
    """管理员更新用户请求"""
    display_name: Optional[str] = Field(None, max_length=255)
    role: Optional[str] = Field(None, pattern="^(user|admin)$")
    is_active: Optional[bool] = None


class UserStats(BaseModel):
    """用户统计信息"""
    total_users: int
    active_users: int
    admin_users: int
    new_today: int


class UserDetailResponse(UserListItem):
    """用户详情（扩展列表项）"""
    collection_count: int = 0
    conversation_count: int = 0
    message_count: int = 0
    last_login_at: Optional[datetime.datetime] = None
```

### 3.3 查询参数

```python
# GET /api/v1/admin/users 查询参数
- keyword: str | None      # 搜索用户名、邮箱、显示名
- role: str | None         # 按角色筛选: user | admin
- is_active: bool | None   # 按状态筛选
- skip: int = 0            # 分页偏移
- limit: int = 50          # 每页数量 (1-200)
```

### 3.4 权限与错误处理

- **401 Unauthorized**：未提供有效 Token
- **403 Forbidden**：当前用户非 admin 角色
- **404 Not Found**：用户 ID 不存在
- **400 Bad Request**：非法参数（如 role 不是 user/admin）
- **409 Conflict**：尝试禁用最后一个管理员账号（系统必须保留至少一个 admin）

### 3.5 审计日志动作码

| 操作 | action 码 | resource_type | 说明 |
|------|-----------|---------------|------|
| 查看用户列表 | `user.list` | `user` | 批量查询 |
| 查看用户详情 | `user.view` | `user` | 单用户查看 |
| 更新用户信息 | `user.update` | `user` | 角色/显示名变更 |
| 禁用账号 | `user.disable` | `user` | is_active = false |
| 启用账号 | `user.enable` | `user` | is_active = true |
| 重置密码 | `user.reset_password` | `user` | 发送重置邮件 |

---

## 4. 邮件服务设计

### 4.1 服务职责

`backend/app/services/email_service.py` 提供异步邮件发送能力，支持：
- SMTP 连接（TLS/SSL）
- HTML 邮件模板渲染
- 密码重置邮件发送

### 4.2 配置项

在 `backend/app/config.py` 中新增：

```python
# 邮件配置
SMTP_HOST: str = "smtp.example.com"
SMTP_PORT: int = 587
SMTP_USER: str = ""
SMTP_PASSWORD: str = ""
SMTP_FROM: str = "noreply@cognibase.com"
SMTP_TLS: bool = True
FRONTEND_URL: str = "http://localhost:3000"
```

### 4.3 重置密码流程

```
1. 管理员点击"重置密码" → 确认弹窗
2. 后端生成 JWT token:
   {
     "sub": "user_id",
     "type": "password_reset",
     "exp": "1小时后"
   }
3. 发送邮件给用户邮箱:
   主题: CogniBase - 密码重置
   内容: 包含重置链接 {FRONTEND_URL}/reset-password?token=xxx
4. 用户点击链接进入 /reset-password 页面
5. 前端验证 token 有效性（未过期、格式正确）
6. 用户输入新密码（8-128位）
7. 前端 POST /api/v1/auth/reset-password {token, new_password}
8. 后端验证 token，更新密码哈希，返回成功
```

### 4.4 邮件模板（HTML）

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>CogniBase 密码重置</title>
</head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1e293b;">CogniBase 密码重置</h2>
  <p>您好，</p>
  <p>管理员已为您触发密码重置。请点击下方链接重置您的密码：</p>
  <a href="{{ reset_url }}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 8px; margin: 16px 0;">重置密码</a>
  <p style="color: #64748b; font-size: 14px;">此链接将在 1 小时后失效。如非本人操作，请忽略此邮件。</p>
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
  <p style="color: #94a3b8; font-size: 12px;">CogniBase 企业知识库系统</p>
</body>
</html>
```

---

## 5. 前端设计

### 5.1 页面路由

| 路由 | 页面 | 访问权限 |
|------|------|----------|
| `/admin/users` | 用户管理列表页 | admin  only |
| `/reset-password` | 密码重置页（邮件链接跳转） | 无需登录 |

### 5.2 用户管理页 (`/admin/users`) 结构

参考审计日志页面 (`/audit-logs`) 的现有风格：

```
┌─────────────────────────────────────────────────────────────┐
│  [图标] 用户管理                    [刷新]                   │
│  管理系统所有用户账号                                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │
│  │ 总用户   │ │ 活跃用户 │ │ 管理员   │ │ 今日新增 │         │
│  │  1,234  │ │  1,180  │ │    5    │ │    3    │         │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘         │
├─────────────────────────────────────────────────────────────┤
│  [搜索框] [角色▼] [状态▼] [注册时间▼]                        │
├─────────────────────────────────────────────────────────────┤
│  用户名    │ 显示名   │ 邮箱       │ 角色  │ 状态  │ 注册时间 │ 操作 │
│  ─────────┼─────────┼───────────┼──────┼──────┼─────────┼──────┤
│  alice    │ Alice   │ a@ex.com  │ 用户  │ 活跃  │ 2026-01 │ [详] │
│  bob      │ Bob     │ b@ex.com  │ 管理员│ 活跃  │ 2025-12 │ [详] │
│  charlie  │ Charlie │ c@ex.com  │ 用户  │ 禁用  │ 2026-03 │ [详] │
├─────────────────────────────────────────────────────────────┤
│  共 1,234 条记录，第 1/25 页    [上一页] [下一页]              │
└─────────────────────────────────────────────────────────────┘
```

**操作按钮说明**：
- **查看详情**：弹窗显示用户统计（知识库数、对话数、消息数、最后登录）
- **编辑**：弹窗修改角色（下拉选择 user/admin）、显示名
- **禁用/启用**：带确认弹窗，切换 `is_active` 状态
- **重置密码**：带确认弹窗，成功后 Toast 提示"重置邮件已发送"

### 5.3 新增组件清单

| 组件 | 路径 | 说明 |
|------|------|------|
| `UserStatsCards` | `frontend/src/components/admin/UserStatsCards.tsx` | 顶部统计卡片 |
| `UserFilterBar` | `frontend/src/components/admin/UserFilterBar.tsx` | 筛选栏 |
| `UserTable` | `frontend/src/components/admin/UserTable.tsx` | 用户表格 |
| `UserDetailDialog` | `frontend/src/components/admin/UserDetailDialog.tsx` | 用户详情弹窗 |
| `UserEditDialog` | `frontend/src/components/admin/UserEditDialog.tsx` | 编辑用户弹窗 |
| `ConfirmDialog` | `frontend/src/components/ConfirmDialog.tsx` | 通用确认弹窗（复用） |

### 5.4 密码重置页 (`/reset-password`)

- 无需登录，从 URL 解析 `token` 参数
- 验证 token 有效性（调用后端验证接口或本地解析 JWT）
- 显示新密码输入框（8-128位，显示密码强度）
- 提交后 POST 到后端，成功后跳转登录页

### 5.5 侧边栏导航

在管理员侧边栏中新增"用户管理"入口，与"数据概览"、"审计日志"并列：

```
CogniBase
─────────
[+] 新建对话

最近
─────────
...对话历史...

功能
─────────
🏠 我的知识库
🔍 语义搜索
💬 智能问答
⭐ 我的收藏

管理
─────────
📊 数据概览      ← 已有
👥 用户管理      ← 新增
🛡️ 审计日志      ← 已有
```

### 5.6 类型定义扩展

在 `frontend/src/types/index.ts` 中新增：

```typescript
// ===== 用户管理 =====

export interface UserListItem {
  id: string;
  username: string;
  email?: string;
  display_name?: string;
  role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserListResponse {
  items: UserListItem[];
  total: number;
}

export interface UserUpdateRequest {
  display_name?: string;
  role?: "user" | "admin";
  is_active?: boolean;
}

export interface UserDetailResponse extends UserListItem {
  collection_count: number;
  conversation_count: number;
  message_count: number;
  last_login_at?: string | null;
}

export interface UserStats {
  total_users: number;
  active_users: number;
  admin_users: number;
  new_today: number;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
}
```

---

## 6. 数据模型

### 6.1 现有模型（无需变更）

`backend/app/models/document.py` 中的 `User` 模型已满足需求：

```python
class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="user")  # user, admin
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

### 6.2 可选增强（建议实现）

新增 `last_login_at` 字段用于显示用户最后登录时间：

```python
last_login_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
```

在登录成功时更新该字段：

```python
# backend/app/auth/jwt.py 中 login 端点
user.last_login_at = datetime.datetime.now(datetime.timezone.utc)
await db.flush()
```

---

## 7. 安全设计

### 7.1 权限控制

- 所有用户管理端点使用 `require_admin` 守卫，非 admin 返回 403
- 禁止禁用最后一个 admin 账号（系统至少保留一个管理员）
- 禁止管理员修改自己的角色为 user（防止系统无管理员）

### 7.2 密码重置安全

- 重置 token 使用 JWT，有效期 1 小时，一次性使用（使用后失效）
- 新密码最小长度 8 位，最大 128 位
- 重置密码接口限流：同一用户 5 分钟内只能发送一次重置邮件

### 7.3 审计日志

所有用户管理操作记录审计日志，包含：
- 操作者（管理员）ID
- 被操作用户 ID
- 操作类型（action）
- 变更详情（detail JSON）
- IP 地址、User-Agent
- 操作时间

---

## 8. 错误处理

### 8.1 后端错误码

| 场景 | HTTP 状态码 | 错误信息 |
|------|-------------|----------|
| 非 admin 访问 | 403 | 需要管理员权限 |
| 用户 ID 不存在 | 404 | 用户不存在 |
| 禁用最后一个 admin | 409 | 系统必须保留至少一个管理员 |
| 管理员降级自己 | 409 | 不能修改自己的管理员权限 |
| 邮箱配置未设置 | 500 | 邮件服务未配置 |
| 重置 token 无效 | 400 | 无效或已过期的重置链接 |
| 重置 token 已使用 | 400 | 该链接已被使用 |

### 8.2 前端错误处理

- API 错误统一显示在页面顶部错误栏（与审计日志一致）
- 操作成功显示 Toast 提示（如"邮件已发送"、"用户已禁用"）
- 确认弹窗用于破坏性操作（禁用账号、重置密码）

---

## 9. 测试策略

### 9.1 后端测试

- **权限测试**：非 admin 用户访问 admin 端点返回 403
- **CRUD 测试**：用户列表查询、详情查看、信息更新
- **边界测试**：禁用最后一个 admin 返回 409
- **邮件测试**：重置密码邮件内容验证、token 过期验证

### 9.2 前端测试

- **权限测试**：非 admin 访问 `/admin/users` 显示无权访问提示
- **交互测试**：筛选、分页、弹窗操作、表单验证
- **密码重置页**：token 无效显示错误、token 有效允许重置

---

## 10. 文件变更清单

### 10.1 新增文件

| 文件 | 说明 |
|------|------|
| `backend/app/schemas/admin.py` | 用户管理相关 Pydantic 模型 |
| `backend/app/services/email_service.py` | 异步邮件服务 |
| `backend/app/templates/email/reset_password.html` | 密码重置邮件模板 |
| `frontend/src/app/admin/users/page.tsx` | 用户管理页面 |
| `frontend/src/app/reset-password/page.tsx` | 密码重置页面 |
| `frontend/src/components/admin/UserStatsCards.tsx` | 统计卡片组件 |
| `frontend/src/components/admin/UserFilterBar.tsx` | 筛选栏组件 |
| `frontend/src/components/admin/UserTable.tsx` | 用户表格组件 |
| `frontend/src/components/admin/UserDetailDialog.tsx` | 用户详情弹窗 |
| `frontend/src/components/admin/UserEditDialog.tsx` | 编辑用户弹窗 |
| `frontend/src/components/ConfirmDialog.tsx` | 通用确认弹窗 |
| `docs/superpowers/plans/2026-07-16-user-management.md` | 实现计划 |

### 10.2 修改文件

| 文件 | 变更 |
|------|------|
| `backend/app/api/admin.py` | 新增用户管理端点 |
| `backend/app/config.py` | 新增 SMTP 和 FRONTEND_URL 配置 |
| `backend/app/auth/jwt.py` | 新增 `/reset-password` 端点，登录时更新 `last_login_at` |
| `backend/app/models/document.py` | 新增 `last_login_at` 字段（可选） |
| `backend/app/main.py` | 注册新路由（如有新增） |
| `frontend/src/lib/api.ts` | 新增用户管理 API 方法 |
| `frontend/src/types/index.ts` | 新增用户管理类型定义 |
| `frontend/src/components/Layout.tsx` | 更新 `getPageTitle` |
| `frontend/src/components/ChatSidebar.tsx` 或导航组件 | 新增"用户管理"导航入口 |
| `backend/.env.example` | 新增 SMTP 配置示例 |

---

## 11. 部署注意事项

### 11.1 环境变量配置

部署前需在 `.env` 中配置邮件服务：

```bash
# SMTP 配置（必填，用于密码重置邮件）
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@cognibase.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=CogniBase <noreply@cognibase.com>
SMTP_TLS=true

# 前端地址（用于邮件中的重置链接）
FRONTEND_URL=https://cognibase.example.com
```

### 11.2 数据库迁移

如果添加 `last_login_at` 字段，需要执行数据库迁移（Alembic 或手动 ALTER TABLE）。

---

## 12. 附录

### 12.1 与现有系统的集成点

| 集成点 | 说明 |
|--------|------|
| `require_admin` | 复用现有管理员权限守卫 |
| `AuditService` | 复用现有审计日志服务，新增 user.* action 码 |
| `get_db` | 复用现有数据库会话依赖 |
| `User` 模型 | 复用现有用户模型，无需结构变更（last_login_at 可选） |
| `api.ts` | 在现有 ApiClient 类中新增方法 |
| `Layout.tsx` | 复用现有布局，更新页面标题映射 |

### 12.2 参考页面

- 审计日志页面：`frontend/src/app/audit-logs/page.tsx` — 表格、筛选、分页风格参考
- Dashboard 页面：`frontend/src/app/dashboard/page.tsx` — 统计卡片风格参考
- 现有 admin API：`backend/app/api/admin.py` — 路由组织风格参考
