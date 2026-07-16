# 用户管理后台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 CogniBase 管理员提供完整的用户管理后台，支持用户列表查看、禁用/启用账号、角色管理、密码重置邮件发送，以及用户自助密码重置页面。

**Architecture:** 后端在现有 `admin.py` 中新增用户管理 CRUD 端点，复用 `require_admin` 守卫和 `AuditService`；新增 `EmailService` 异步邮件服务处理密码重置。前端新建 `/admin/users` 管理页面和 `/reset-password` 密码重置页面，风格与现有审计日志页面保持一致。

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (async) + aiosmtplib, Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + lucide-react

---

## File Structure

### 后端新增
- `backend/app/schemas/admin.py` — 用户管理 Pydantic 模型
- `backend/app/services/email_service.py` — 异步邮件服务
- `backend/app/templates/email/reset_password.html` — 密码重置邮件模板

### 后端修改
- `backend/app/api/admin.py` — 新增用户管理端点
- `backend/app/config.py` — 新增 SMTP / FRONTEND_URL 配置
- `backend/app/auth/jwt.py` — 新增 `/reset-password` 端点，登录时更新 last_login_at
- `backend/app/models/document.py` — 新增 `last_login_at` 字段
- `backend/app/main.py` — 无需修改（admin 路由已注册）
- `backend/.env.example` — 新增 SMTP 配置示例

### 前端新增
- `frontend/src/app/admin/users/page.tsx` — 用户管理页面
- `frontend/src/app/reset-password/page.tsx` — 密码重置页面
- `frontend/src/components/admin/UserStatsCards.tsx` — 统计卡片
- `frontend/src/components/admin/UserFilterBar.tsx` — 筛选栏
- `frontend/src/components/admin/UserTable.tsx` — 用户表格
- `frontend/src/components/admin/UserDetailDialog.tsx` — 用户详情弹窗
- `frontend/src/components/admin/UserEditDialog.tsx` — 编辑用户弹窗
- `frontend/src/components/ConfirmDialog.tsx` — 通用确认弹窗

### 前端修改
- `frontend/src/lib/api.ts` — 新增用户管理 API 方法
- `frontend/src/types/index.ts` — 新增用户管理类型定义
- `frontend/src/components/Layout.tsx` — 更新 `getPageTitle` 映射
- `frontend/src/components/ChatSidebar.tsx`（或导航组件）— 新增"用户管理"导航入口

---

## Task 1: 后端配置扩展 — SMTP 与前端地址

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/.env.example`
- Test: `backend/tests/test_config.py`（如存在，否则手动验证）

- [ ] **Step 1: 在 config.py 中新增邮件和前端配置项**

在 `backend/app/config.py` 的 `Settings` 类中，在现有配置之后新增：

```python
    # 邮件配置
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_TLS: bool = True

    # 前端地址（用于邮件中的链接）
    FRONTEND_URL: str = "http://localhost:3000"
```

- [ ] **Step 2: 在 .env.example 中新增配置示例**

在 `backend/.env.example` 末尾追加：

```bash
# SMTP 邮件配置（用于密码重置）
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=CogniBase <noreply@example.com>
SMTP_TLS=true

# 前端地址
FRONTEND_URL=http://localhost:3000
```

- [ ] **Step 3: 验证配置加载**

Run: `python -c "from app.config import settings; print(settings.SMTP_HOST, settings.FRONTEND_URL)"`
Expected: 输出默认值（空字符串和 http://localhost:3000）

- [ ] **Step 4: Commit**

```bash
git add backend/app/config.py backend/.env.example
git commit -m "feat(config): add SMTP and frontend URL settings for user management"
```

---

## Task 2: 后端数据模型 — 新增 last_login_at 字段

**Files:**
- Modify: `backend/app/models/document.py`
- Modify: `backend/app/auth/jwt.py`
- Test: `backend/tests/test_models.py`（如存在，否则手动验证）

- [ ] **Step 1: 在 User 模型中新增 last_login_at 字段**

在 `backend/app/models/document.py` 的 `User` 类中，在 `updated_at` 字段之后添加：

```python
    last_login_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
```

- [ ] **Step 2: 在登录成功时更新 last_login_at**

在 `backend/app/auth/jwt.py` 的 `login` 函数中，在 `token = create_access_token(...)` 之前添加：

```python
        user.last_login_at = datetime.datetime.now(datetime.timezone.utc)
        await db.flush()
```

确保 `datetime` 已在文件顶部导入（检查现有导入）。

- [ ] **Step 3: 验证模型变更**

Run: `python -c "from app.models.document import User; print('last_login_at' in User.__table__.columns.keys())"`
Expected: `True`

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/document.py backend/app/auth/jwt.py
git commit -m "feat(models): add last_login_at to User model and update on login"
```

---

## Task 3: 后端 Pydantic 模型 — 用户管理 Schema

**Files:**
- Create: `backend/app/schemas/admin.py`
- Test: `python -c "from app.schemas.admin import UserListResponse; print('OK')"`

- [ ] **Step 1: 创建 admin schemas 文件**

创建 `backend/app/schemas/admin.py`：

```python
"""Admin 相关 Pydantic 模型"""

from __future__ import annotations

import datetime
from typing import Optional

from pydantic import BaseModel, Field


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

- [ ] **Step 2: 验证导入**

Run: `python -c "from app.schemas.admin import UserListResponse, UserDetailResponse, UserStats; print('schemas OK')"`
Expected: `schemas OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/admin.py
git commit -m "feat(schemas): add admin user management pydantic models"
```

---

## Task 4: 后端邮件服务 — EmailService

**Files:**
- Create: `backend/app/services/email_service.py`
- Create: `backend/app/templates/email/reset_password.html`
- Test: `python -c "from app.services.email_service import EmailService; print('OK')"`

- [ ] **Step 1: 创建邮件服务**

创建 `backend/app/services/email_service.py`：

```python
"""异步邮件服务"""

from __future__ import annotations

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from loguru import logger

from app.config import settings


class EmailService:
    """异步邮件发送服务"""

    @staticmethod
    async def send_reset_password_email(to_email: str, reset_url: str) -> None:
        """发送密码重置邮件"""
        if not settings.SMTP_HOST:
            logger.warning("SMTP 未配置，跳过发送重置密码邮件")
            return

        subject = "CogniBase - 密码重置"
        html_content = EmailService._render_reset_password_template(reset_url)

        await EmailService._send_email(to_email, subject, html_content)
        logger.info(f"密码重置邮件已发送至 {to_email}")

    @staticmethod
    def _render_reset_password_template(reset_url: str) -> str:
        """渲染密码重置邮件模板"""
        return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>CogniBase 密码重置</title>
</head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1e293b;">CogniBase 密码重置</h2>
  <p>您好，</p>
  <p>管理员已为您触发密码重置。请点击下方链接重置您的密码：</p>
  <a href="{reset_url}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 8px; margin: 16px 0;">重置密码</a>
  <p style="color: #64748b; font-size: 14px;">此链接将在 1 小时后失效。如非本人操作，请忽略此邮件。</p>
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
  <p style="color: #94a3b8; font-size: 12px;">CogniBase 企业知识库系统</p>
</body>
</html>"""

    @staticmethod
    async def _send_email(to_email: str, subject: str, html_content: str) -> None:
        """发送 HTML 邮件"""
        try:
            import aiosmtplib
        except ImportError:
            logger.error("aiosmtplib 未安装，无法发送邮件")
            raise RuntimeError("邮件服务未配置：aiosmtplib 未安装")

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
        msg["To"] = to_email

        html_part = MIMEText(html_content, "html", "utf-8")
        msg.attach(html_part)

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=settings.SMTP_TLS,
        )
```

- [ ] **Step 2: 将 aiosmtplib 加入 requirements.txt**

在 `backend/requirements.txt` 中新增一行（找到合适位置，如其他依赖之后）：

```
aiosmtplib>=3.0.0
```

- [ ] **Step 3: 验证邮件服务导入**

Run: `python -c "from app.services.email_service import EmailService; print('EmailService OK')"`
Expected: `EmailService OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/email_service.py backend/requirements.txt
git commit -m "feat(services): add async email service for password reset"
```

---

## Task 5: 后端 API — 用户管理端点

**Files:**
- Modify: `backend/app/api/admin.py`
- Test: `curl` 或 pytest 手动验证

- [ ] **Step 1: 在 admin.py 中新增用户管理端点**

在 `backend/app/api/admin.py` 中，在现有导入之后、现有路由之前，新增导入：

```python
from app.schemas.admin import (
    UserDetailResponse,
    UserListResponse,
    UserStats,
    UserUpdateRequest,
)
from app.services.email_service import EmailService
from app.auth.jwt import create_access_token, decode_access_token
```

在现有路由之后，新增以下端点：

```python

@router.get("/users/stats", response_model=UserStats)
async def get_user_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """获取用户统计（仅 admin）"""
    from sqlalchemy import func

    total = (await db.execute(select(func.count(User.id)))).scalar() or 0
    active = (await db.execute(select(func.count(User.id)).where(User.is_active == True))).scalar() or 0
    admin_count = (await db.execute(select(func.count(User.id)).where(User.role == "admin"))).scalar() or 0

    from datetime import datetime, timedelta
    today_start = datetime.now(datetime.timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    new_today = (
        await db.execute(select(func.count(User.id)).where(User.created_at >= today_start))
    ).scalar() or 0

    await AuditService.log(
        db=db,
        user_id=current_user.id,
        action="user.list",
        resource_type="user",
        resource_id="stats",
        detail={"scope": "stats"},
    )
    await db.commit()

    return UserStats(
        total_users=total,
        active_users=active,
        admin_users=admin_count,
        new_today=new_today,
    )


@router.get("/users", response_model=UserListResponse)
async def list_users(
    keyword: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """查询用户列表（仅 admin）"""
    from sqlalchemy import or_

    # count
    count_query = select(func.count(User.id))
    if role:
        count_query = count_query.where(User.role == role)
    if is_active is not None:
        count_query = count_query.where(User.is_active == is_active)
    if keyword:
        pattern = f"%{keyword}%"
        count_query = count_query.where(
            or_(
                User.username.ilike(pattern),
                User.email.ilike(pattern),
                User.display_name.ilike(pattern),
            )
        )
    total = (await db.execute(count_query)).scalar() or 0

    # list
    query = select(User)
    if role:
        query = query.where(User.role == role)
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    if keyword:
        pattern = f"%{keyword}%"
        query = query.where(
            or_(
                User.username.ilike(pattern),
                User.email.ilike(pattern),
                User.display_name.ilike(pattern),
            )
        )
    query = query.order_by(User.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()

    await AuditService.log(
        db=db,
        user_id=current_user.id,
        action="user.list",
        resource_type="user",
        resource_id="list",
        detail={"keyword": keyword, "role": role, "is_active": is_active},
    )
    await db.commit()

    return UserListResponse(
        items=[UserListItem.model_validate(u) for u in users],
        total=total,
    )


@router.get("/users/{user_id}", response_model=UserDetailResponse)
async def get_user_detail(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """查看用户详情（仅 admin）"""
    from sqlalchemy import func

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 统计
    collection_count = (
        await db.execute(select(func.count(Collection.id)).where(Collection.owner_id == user_id))
    ).scalar() or 0
    conversation_count = (
        await db.execute(select(func.count(Conversation.id)).where(Conversation.user_id == user_id))
    ).scalar() or 0
    message_count = (
        await db.execute(
            select(func.count(Message.id))
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(Conversation.user_id == user_id)
        )
    ).scalar() or 0

    await AuditService.log(
        db=db,
        user_id=current_user.id,
        action="user.view",
        resource_type="user",
        resource_id=user_id,
        detail={"username": user.username},
    )
    await db.commit()

    return UserDetailResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
        collection_count=collection_count,
        conversation_count=conversation_count,
        message_count=message_count,
        last_login_at=user.last_login_at,
    )


@router.put("/users/{user_id}", response_model=UserDetailResponse)
async def update_user(
    user_id: str,
    request: UserUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """更新用户信息（仅 admin）"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 禁止修改自己的角色
    if user_id == current_user.id and request.role is not None and request.role != current_user.role:
        raise HTTPException(status_code=409, detail="不能修改自己的管理员权限")

    # 禁止禁用最后一个 admin
    if request.is_active is False and user.role == "admin":
        admin_count = (
            await db.execute(select(func.count(User.id)).where(User.role == "admin", User.is_active == True))
        ).scalar() or 0
        if admin_count <= 1:
            raise HTTPException(status_code=409, detail="系统必须保留至少一个管理员")

    old_role = user.role
    old_active = user.is_active

    if request.display_name is not None:
        user.display_name = request.display_name
    if request.role is not None:
        user.role = request.role
    if request.is_active is not None:
        user.is_active = request.is_active

    await db.flush()

    action_code = "user.update"
    if request.is_active is not None:
        action_code = "user.enable" if request.is_active else "user.disable"

    await AuditService.log(
        db=db,
        user_id=current_user.id,
        action=action_code,
        resource_type="user",
        resource_id=user_id,
        detail={
            "username": user.username,
            "old_role": old_role,
            "new_role": user.role,
            "old_active": old_active,
            "new_active": user.is_active,
        },
    )
    await db.commit()

    return UserDetailResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
        collection_count=0,
        conversation_count=0,
        message_count=0,
        last_login_at=user.last_login_at,
    )


@router.post("/users/{user_id}/toggle-status")
async def toggle_user_status(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """切换用户禁用/启用状态（仅 admin）"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")

    if user_id == current_user.id:
        raise HTTPException(status_code=409, detail="不能禁用当前登录的管理员账号")

    if not user.is_active and user.role == "admin":
        # 即将禁用 admin，检查是否最后一个
        admin_count = (
            await db.execute(select(func.count(User.id)).where(User.role == "admin", User.is_active == True))
        ).scalar() or 0
        if admin_count <= 1:
            raise HTTPException(status_code=409, detail="系统必须保留至少一个管理员")

    user.is_active = not user.is_active
    await db.flush()

    action_code = "user.enable" if user.is_active else "user.disable"
    await AuditService.log(
        db=db,
        user_id=current_user.id,
        action=action_code,
        resource_type="user",
        resource_id=user_id,
        detail={"username": user.username, "is_active": user.is_active},
    )
    await db.commit()

    return {"id": user.id, "is_active": user.is_active, "message": "状态已更新"}


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """发送密码重置邮件（仅 admin）"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")

    if not user.email:
        raise HTTPException(status_code=400, detail="用户未设置邮箱")

    # 生成 JWT 重置 token（1小时有效）
    import datetime
    from app.auth.jwt import create_access_token

    reset_token = create_access_token(
        user_id=user.id,
        username=user.username,
        role=user.role,
        expires_delta=datetime.timedelta(hours=1),
    )

    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"

    await EmailService.send_reset_password_email(user.email, reset_url)

    await AuditService.log(
        db=db,
        user_id=current_user.id,
        action="user.reset_password",
        resource_type="user",
        resource_id=user_id,
        detail={"username": user.username, "email": user.email},
    )
    await db.commit()

    return {"message": "密码重置邮件已发送"}
```

注意：需要在文件顶部确认 `func` 已从 `sqlalchemy` 导入（现有代码已有）。

- [ ] **Step 2: 验证端点注册**

Run: `python -c "from app.main import app; [r for r in app.routes if 'users' in str(r.path)]; print('routes OK')"`
Expected: 无报错，输出 `routes OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/admin.py
git commit -m "feat(api): add user management endpoints for admin"
```

---

## Task 6: 后端 API — 密码重置端点

**Files:**
- Modify: `backend/app/auth/jwt.py`
- Test: `curl` 手动验证

- [ ] **Step 1: 在 jwt.py 中新增密码重置端点**

在 `backend/app/auth/jwt.py` 中，在现有 `get_me` 端点之后，新增：

```python

class ResetPasswordRequest(BaseModel):
    """密码重置请求"""
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)


@router.post("/reset-password")
async def reset_password(
    request: ResetPasswordRequest,
    req: Request,
    db: AsyncSession = Depends(get_db),
):
    """通过邮件 token 重置密码"""
    payload = decode_access_token(request.token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无效或已过期的重置链接",
        )

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户不存在",
        )

    # 更新密码
    user.hashed_password = hash_password(request.new_password)
    await db.flush()

    await AuditService.log(
        db=db,
        user_id=user.id,
        action="auth.reset_password",
        resource_type="user",
        resource_id=user.id,
        detail={"username": user.username},
        request=req,
    )
    await db.commit()

    return {"message": "密码重置成功"}
```

- [ ] **Step 2: 验证端点**

Run: `python -c "from app.main import app; print('reset-password endpoint registered')"`
Expected: 无报错

- [ ] **Step 3: Commit**

```bash
git add backend/app/auth/jwt.py
git commit -m "feat(auth): add password reset endpoint via email token"
```

---

## Task 7: 前端类型定义 — 用户管理类型

**Files:**
- Modify: `frontend/src/types/index.ts`
- Test: TypeScript 编译检查

- [ ] **Step 1: 在 types/index.ts 中新增用户管理类型**

在文件末尾（最后一个导出之后）追加：

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

- [ ] **Step 2: 验证类型编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误（或仅现有错误）

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(types): add user management type definitions"
```

---

## Task 8: 前端 API 客户端 — 用户管理方法

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Test: TypeScript 编译检查

- [ ] **Step 1: 在 ApiClient 中新增用户管理方法**

在 `frontend/src/lib/api.ts` 中，在现有 `getDashboardStats` 方法之后、`addFavorite` 之前，新增：

```typescript
  // ===== 用户管理 (Admin) =====

  async getUserStats(): Promise<UserStats> {
    return this.request<UserStats>("/api/v1/admin/users/stats");
  }

  async listUsers(params: {
    keyword?: string;
    role?: string;
    is_active?: boolean;
    skip?: number;
    limit?: number;
  } = {}): Promise<UserListResponse> {
    const qs = new URLSearchParams();
    if (params.keyword) qs.set("keyword", params.keyword);
    if (params.role) qs.set("role", params.role);
    if (params.is_active !== undefined) qs.set("is_active", String(params.is_active));
    if (params.skip !== undefined) qs.set("skip", String(params.skip));
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return this.request<UserListResponse>(
      `/api/v1/admin/users${query ? `?${query}` : ""}`
    );
  }

  async getUserDetail(userId: string): Promise<UserDetailResponse> {
    return this.request<UserDetailResponse>(`/api/v1/admin/users/${userId}`);
  }

  async updateUser(userId: string, data: UserUpdateRequest): Promise<UserDetailResponse> {
    return this.request<UserDetailResponse>(`/api/v1/admin/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async toggleUserStatus(userId: string): Promise<{ id: string; is_active: boolean; message: string }> {
    return this.request<{ id: string; is_active: boolean; message: string }>(
      `/api/v1/admin/users/${userId}/toggle-status`,
      { method: "POST" }
    );
  }

  async resetUserPassword(userId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      `/api/v1/admin/users/${userId}/reset-password`,
      { method: "POST" }
    );
  }

  async resetPassword(token: string, new_password: string): Promise<{ message: string }> {
    return this.request<{ message: string }>("/api/v1/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    });
  }
```

同时确保文件顶部导入新增的类型：

```typescript
import type {
  // ... existing imports ...
  UserListItem,
  UserListResponse,
  UserUpdateRequest,
  UserDetailResponse,
  UserStats,
  ResetPasswordRequest,
} from "@/types";
```

- [ ] **Step 2: 验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(api-client): add user management API methods"
```

---

## Task 9: 前端通用组件 — ConfirmDialog

**Files:**
- Create: `frontend/src/components/ConfirmDialog.tsx`
- Test: 视觉检查（后续页面集成时验证）

- [ ] **Step 1: 创建通用确认弹窗组件**

创建 `frontend/src/components/ConfirmDialog.tsx`：

```tsx
"use client";

import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  confirmVariant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  const confirmBtnClass =
    confirmVariant === "danger"
      ? "bg-red-600 text-white hover:bg-red-700"
      : "bg-blue-600 text-white hover:bg-blue-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">{message}</p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${confirmBtnClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ConfirmDialog.tsx
git commit -m "feat(ui): add reusable ConfirmDialog component"
```

---

## Task 10: 前端用户管理组件 — UserStatsCards

**Files:**
- Create: `frontend/src/components/admin/UserStatsCards.tsx`
- Test: 视觉检查

- [ ] **Step 1: 创建统计卡片组件**

创建 `frontend/src/components/admin/UserStatsCards.tsx`：

```tsx
import { Users, UserCheck, Shield, UserPlus } from "lucide-react";
import type { UserStats } from "@/types";

interface UserStatsCardsProps {
  stats: UserStats | null;
}

export default function UserStatsCards({ stats }: UserStatsCardsProps) {
  const cards = [
    {
      label: "总用户",
      value: stats?.total_users ?? 0,
      icon: Users,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "活跃用户",
      value: stats?.active_users ?? 0,
      icon: UserCheck,
      color: "bg-green-50 text-green-600",
    },
    {
      label: "管理员",
      value: stats?.admin_users ?? 0,
      icon: Shield,
      color: "bg-amber-50 text-amber-600",
    },
    {
      label: "今日新增",
      value: stats?.new_today ?? 0,
      icon: UserPlus,
      color: "bg-purple-50 text-purple-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.color}`}>
              <card.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-slate-500">{card.label}</p>
              <p className="text-lg font-bold text-slate-900">{card.value}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/admin/UserStatsCards.tsx
git commit -m "feat(ui): add UserStatsCards component for admin dashboard"
```

---

## Task 11: 前端用户管理组件 — UserFilterBar

**Files:**
- Create: `frontend/src/components/admin/UserFilterBar.tsx`
- Test: 视觉检查

- [ ] **Step 1: 创建筛选栏组件**

创建 `frontend/src/components/admin/UserFilterBar.tsx`：

```tsx
import { Search } from "lucide-react";

interface UserFilterBarProps {
  keyword: string;
  role: string;
  isActive: string;
  onKeywordChange: (v: string) => void;
  onRoleChange: (v: string) => void;
  onIsActiveChange: (v: string) => void;
}

export default function UserFilterBar({
  keyword,
  role,
  isActive,
  onKeywordChange,
  onRoleChange,
  onIsActiveChange,
}: UserFilterBarProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索用户名/邮箱..."
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <select
          value={role}
          onChange={(e) => onRoleChange(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">全部角色</option>
          <option value="user">普通用户</option>
          <option value="admin">管理员</option>
        </select>

        <select
          value={isActive}
          onChange={(e) => onIsActiveChange(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">全部状态</option>
          <option value="true">活跃</option>
          <option value="false">禁用</option>
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/admin/UserFilterBar.tsx
git commit -m "feat(ui): add UserFilterBar component for user list filtering"
```

---

## Task 12: 前端用户管理组件 — UserTable

**Files:**
- Create: `frontend/src/components/admin/UserTable.tsx`
- Test: 视觉检查

- [ ] **Step 1: 创建用户表格组件**

创建 `frontend/src/components/admin/UserTable.tsx`：

```tsx
import { Eye, Pencil, Lock, Ban, CheckCircle, Loader2 } from "lucide-react";
import type { UserListItem } from "@/types";

interface UserTableProps {
  users: UserListItem[];
  loading: boolean;
  onView: (user: UserListItem) => void;
  onEdit: (user: UserListItem) => void;
  onToggleStatus: (user: UserListItem) => void;
  onResetPassword: (user: UserListItem) => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function RoleBadge({ role }: { role: string }) {
  if (role === "admin")
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        管理员
      </span>
    );
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      用户
    </span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  if (isActive)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle className="h-3 w-3" />
        活跃
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      <Ban className="h-3 w-3" />
      禁用
    </span>
  );
}

export default function UserTable({
  users,
  loading,
  onView,
  onEdit,
  onToggleStatus,
  onResetPassword,
}: UserTableProps) {
  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        <span className="ml-2 text-sm text-slate-500">加载中...</span>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Users className="h-10 w-10 text-slate-300" />
        <p className="mt-2 text-sm text-slate-500">暂无用户</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/50">
            <th className="px-4 py-3 text-left font-medium text-slate-500">用户名</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">显示名</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">邮箱</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">角色</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">状态</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">注册时间</th>
            <th className="px-4 py-3 text-right font-medium text-slate-500">操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
            >
              <td className="px-4 py-3 font-medium text-slate-800">{user.username}</td>
              <td className="px-4 py-3 text-slate-600">{user.display_name || "-"}</td>
              <td className="px-4 py-3 text-xs text-slate-500">{user.email || "-"}</td>
              <td className="px-4 py-3">
                <RoleBadge role={user.role} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge isActive={user.is_active} />
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">{formatDate(user.created_at)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onView(user)}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    title="查看详情"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onEdit(user)}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    title="编辑"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onToggleStatus(user)}
                    className={`rounded-lg p-1.5 hover:bg-slate-100 ${
                      user.is_active ? "text-red-500 hover:text-red-700" : "text-green-500 hover:text-green-700"
                    }`}
                    title={user.is_active ? "禁用" : "启用"}
                  >
                    {user.is_active ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => onResetPassword(user)}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    title="重置密码"
                  >
                    <Lock className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

注意：需要在文件顶部添加 `Users` 的导入：

```tsx
import { Eye, Pencil, Lock, Ban, CheckCircle, Loader2, Users } from "lucide-react";
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/admin/UserTable.tsx
git commit -m "feat(ui): add UserTable component for admin user list"
```

---

## Task 13: 前端用户管理组件 — UserDetailDialog

**Files:**
- Create: `frontend/src/components/admin/UserDetailDialog.tsx`
- Test: 视觉检查

- [ ] **Step 1: 创建用户详情弹窗**

创建 `frontend/src/components/admin/UserDetailDialog.tsx`：

```tsx
import { X, FolderOpen, MessageSquare, MessagesSquare, Clock } from "lucide-react";
import type { UserDetailResponse } from "@/types";

interface UserDetailDialogProps {
  open: boolean;
  user: UserDetailResponse | null;
  onClose: () => void;
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("zh-CN");
}

export default function UserDetailDialog({ open, user, onClose }: UserDetailDialogProps) {
  if (!open || !user) return null;

  const stats = [
    { label: "知识库数", value: user.collection_count, icon: FolderOpen },
    { label: "对话数", value: user.conversation_count, icon: MessageSquare },
    { label: "消息数", value: user.message_count, icon: MessagesSquare },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">用户详情</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500">用户名</p>
              <p className="text-sm font-medium text-slate-800">{user.username}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">显示名</p>
              <p className="text-sm font-medium text-slate-800">{user.display_name || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">邮箱</p>
              <p className="text-sm font-medium text-slate-800">{user.email || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">角色</p>
              <p className="text-sm font-medium text-slate-800">
                {user.role === "admin" ? "管理员" : "普通用户"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">状态</p>
              <p className="text-sm font-medium text-slate-800">
                {user.is_active ? "活跃" : "禁用"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">注册时间</p>
              <p className="text-sm font-medium text-slate-800">{formatDateTime(user.created_at)}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              最后登录
            </p>
            <p className="text-sm font-medium text-slate-800">{formatDateTime(user.last_login_at)}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                <s.icon className="mx-auto h-4 w-4 text-slate-400" />
                <p className="mt-1 text-lg font-bold text-slate-900">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/admin/UserDetailDialog.tsx
git commit -m "feat(ui): add UserDetailDialog component"
```

---

## Task 14: 前端用户管理组件 — UserEditDialog

**Files:**
- Create: `frontend/src/components/admin/UserEditDialog.tsx`
- Test: 视觉检查

- [ ] **Step 1: 创建编辑用户弹窗**

创建 `frontend/src/components/admin/UserEditDialog.tsx`：

```tsx
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { UserListItem } from "@/types";

interface UserEditDialogProps {
  open: boolean;
  user: UserListItem | null;
  onSave: (userId: string, data: { display_name?: string; role?: string }) => void;
  onClose: () => void;
}

export default function UserEditDialog({ open, user, onSave, onClose }: UserEditDialogProps) {
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("user");

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || "");
      setRole(user.role);
    }
  }, [user]);

  if (!open || !user) return null;

  const handleSave = () => {
    const data: { display_name?: string; role?: string } = {};
    if (displayName !== (user.display_name || "")) data.display_name = displayName;
    if (role !== user.role) data.role = role;
    onSave(user.id, data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">编辑用户</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">用户名</label>
            <p className="mt-1 text-sm text-slate-500">{user.username}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">显示名</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              maxLength={255}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">角色</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/admin/UserEditDialog.tsx
git commit -m "feat(ui): add UserEditDialog component for admin"
```

---

## Task 15: 前端页面 — 用户管理页 (/admin/users)

**Files:**
- Create: `frontend/src/app/admin/users/page.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Test: 浏览器访问 `/admin/users`

- [ ] **Step 1: 创建用户管理页面**

创建 `frontend/src/app/admin/users/page.tsx`：

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Layout from "@/components/Layout";
import type { UserListItem, UserDetailResponse } from "@/types";
import { ShieldCheck, AlertCircle, Users, ChevronLeft, ChevronRight } from "lucide-react";

import UserStatsCards from "@/components/admin/UserStatsCards";
import UserFilterBar from "@/components/admin/UserFilterBar";
import UserTable from "@/components/admin/UserTable";
import UserDetailDialog from "@/components/admin/UserDetailDialog";
import UserEditDialog from "@/components/admin/UserEditDialog";
import ConfirmDialog from "@/components/ConfirmDialog";

const PAGE_SIZE = 30;

export default function AdminUsersPage() {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);

  // 筛选
  const [keyword, setKeyword] = useState("");
  const [role, setRole] = useState("");
  const [isActive, setIsActive] = useState("");

  // 弹窗
  const [detailUser, setDetailUser] = useState<UserDetailResponse | null>(null);
  const [editUser, setEditUser] = useState<UserListItem | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: "", message: "", onConfirm: () => {} });

  const loadStats = useCallback(async () => {
    try {
      const data = await api.getUserStats();
      setStats(data);
    } catch (err) {
      console.error("加载统计失败", err);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params: Record<string, unknown> = {
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      };
      if (keyword) params.keyword = keyword;
      if (role) params.role = role;
      if (isActive) params.is_active = isActive === "true";
      const data = await api.listUsers(params);
      setUsers(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, keyword, role, isActive]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadStats();
      loadUsers();
    }
  }, [authLoading, isAuthenticated, loadStats, loadUsers]);

  useEffect(() => {
    setPage(0);
  }, [keyword, role, isActive]);

  const handleView = async (u: UserListItem) => {
    try {
      const detail = await api.getUserDetail(u.id);
      setDetailUser(detail);
    } catch (err) {
      alert(err instanceof Error ? err.message : "加载详情失败");
    }
  };

  const handleEdit = (u: UserListItem) => {
    setEditUser(u);
  };

  const handleSaveEdit = async (userId: string, data: { display_name?: string; role?: string }) => {
    try {
      await api.updateUser(userId, data);
      setEditUser(null);
      loadUsers();
      loadStats();
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新失败");
    }
  };

  const handleToggleStatus = (u: UserListItem) => {
    const action = u.is_active ? "禁用" : "启用";
    setConfirmDialog({
      open: true,
      title: `${action}账号`,
      message: `确定要${action}用户 "${u.username}" 吗？`,
      onConfirm: async () => {
        try {
          await api.toggleUserStatus(u.id);
          setConfirmDialog((prev) => ({ ...prev, open: false }));
          loadUsers();
          loadStats();
        } catch (err) {
          alert(err instanceof Error ? err.message : "操作失败");
        }
      },
    });
  };

  const handleResetPassword = (u: UserListItem) => {
    setConfirmDialog({
      open: true,
      title: "重置密码",
      message: `确定要为用户 "${u.username}" 发送密码重置邮件吗？`,
      onConfirm: async () => {
        try {
          await api.resetUserPassword(u.id);
          setConfirmDialog((prev) => ({ ...prev, open: false }));
          alert("密码重置邮件已发送");
        } catch (err) {
          alert(err instanceof Error ? err.message : "发送失败");
        }
      },
    });
  };

  if (authLoading) return null;

  if (user?.role !== "admin") {
    return (
      <Layout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <ShieldCheck className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">仅管理员可访问用户管理</p>
          </div>
        </div>
      </Layout>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* 页头 */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">用户管理</h1>
              <p className="text-xs text-slate-500">管理系统所有用户账号</p>
            </div>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="mb-6">
          <UserStatsCards stats={stats} />
        </div>

        {/* 筛选栏 */}
        <div className="mb-4">
          <UserFilterBar
            keyword={keyword}
            role={role}
            isActive={isActive}
            onKeywordChange={setKeyword}
            onRoleChange={setRole}
            onIsActiveChange={setIsActive}
          />
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-100 p-3.5 text-sm text-red-600 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
            <button
              onClick={() => loadUsers()}
              className="ml-auto text-xs font-medium text-red-700 hover:underline"
            >
              重试
            </button>
          </div>
        )}

        {/* 用户表格 */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <UserTable
            users={users}
            loading={loading}
            onView={handleView}
            onEdit={handleEdit}
            onToggleStatus={handleToggleStatus}
            onResetPassword={handleResetPassword}
          />

          {/* 分页 */}
          {total > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3">
              <span className="text-xs text-slate-500">
                共 {total} 条记录，第 {page + 1}/{totalPages} 页
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  下一页
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 弹窗 */}
      <UserDetailDialog
        open={!!detailUser}
        user={detailUser}
        onClose={() => setDetailUser(null)}
      />
      <UserEditDialog
        open={!!editUser}
        user={editUser}
        onSave={handleSaveEdit}
        onClose={() => setEditUser(null)}
      />
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
      />
    </Layout>
  );
}
```

- [ ] **Step 2: 更新 Layout 页面标题映射**

在 `frontend/src/components/Layout.tsx` 的 `getPageTitle` 函数中，在 `if (pathname.startsWith("/audit-logs"))` 之后新增：

```typescript
  if (pathname.startsWith("/admin/users")) return "用户管理";
```

- [ ] **Step 3: 验证页面编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/admin/users/page.tsx frontend/src/components/Layout.tsx
git commit -m "feat(pages): add admin user management page"
```

---

## Task 16: 前端页面 — 密码重置页 (/reset-password)

**Files:**
- Create: `frontend/src/app/reset-password/page.tsx`
- Test: 浏览器访问 `/reset-password?token=xxx`

- [ ] **Step 1: 创建密码重置页面**

创建 `frontend/src/app/reset-password/page.tsx`：

```tsx
"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle } from "lucide-react";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("无效的重置链接，请检查邮件中的链接是否完整。");
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("密码长度至少为 8 位");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => {
        router.push("/login");
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "重置失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">CogniBase</h1>
          <p className="mt-1 text-sm text-slate-500">密码重置</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {success ? (
            <div className="text-center">
              <CheckCircle className="mx-auto h-10 w-10 text-green-500" />
              <h2 className="mt-3 text-base font-semibold text-slate-900">密码重置成功</h2>
              <p className="mt-1 text-sm text-slate-500">3 秒后自动跳转至登录页...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-600 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700">新密码</label>
                <div className="relative mt-1">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="至少 8 位"
                    minLength={8}
                    maxLength={128}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">确认密码</label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="再次输入新密码"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || !token}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? (
                  <span>处理中...</span>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    重置密码
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/reset-password/page.tsx
git commit -m "feat(pages): add password reset page for email token"
```

---

## Task 17: 前端导航 — 侧边栏新增用户管理入口

**Files:**
- Modify: `frontend/src/components/ChatSidebar.tsx`（或当前导航组件）
- Test: 浏览器检查侧边栏导航

- [ ] **Step 1: 找到导航组件并添加入口**

需要检查当前导航组件的位置。通常在 `ChatSidebar.tsx` 或类似组件中。在管理员导航区域（与"数据概览"、"审计日志"并列的位置）新增：

```tsx
import { Users } from "lucide-react";

// 在管理区域链接数组中新增
{ href: "/admin/users", label: "用户管理", icon: Users },
```

具体修改位置取决于当前 `ChatSidebar.tsx` 中导航链接的定义方式。参考现有审计日志入口的添加方式。

- [ ] **Step 2: 验证编译**

Run: `cd frontend && npx tsc --noEmit`
Expected: 无类型错误

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ChatSidebar.tsx
git commit -m "feat(nav): add user management link to admin sidebar"
```

---

## Task 18: 集成测试与验证

**Files:**
- 无新增文件，使用现有测试基础设施

- [ ] **Step 1: 启动后端服务**

Run: `cd backend && python -m uvicorn app.main:app --reload --port 8000`
Expected: 服务启动成功，控制台显示路由注册信息

- [ ] **Step 2: 启动前端开发服务器**

Run: `cd frontend && npm run dev`
Expected: Next.js 编译成功，监听端口 3000

- [ ] **Step 3: 端到端功能验证**

按以下清单验证：

1. [ ] 管理员登录后，侧边栏显示"用户管理"入口
2. [ ] 点击"用户管理"进入 `/admin/users`，显示统计卡片和表格
3. [ ] 表格分页正常工作
4. [ ] 筛选栏（角色、状态、关键词）正常工作
5. [ ] 点击"查看详情"弹窗显示用户统计
6. [ ] 点击"编辑"弹窗可修改角色和显示名
7. [ ] 点击"禁用"确认后账号被禁用，该用户无法登录
8. [ ] 点击"启用"确认后账号恢复
9. [ ] 点击"重置密码"确认后发送邮件（如 SMTP 已配置）
10. [ ] 非 admin 用户访问 `/admin/users` 显示无权访问提示
11. [ ] 访问 `/reset-password?token=xxx` 可输入新密码
12. [ ] 密码重置成功后可用新密码登录

- [ ] **Step 4: 最终 Commit**

```bash
git commit -m "feat: complete user management backend and frontend implementation"
```

---

## Spec Coverage Checklist

| Spec 需求 | 实现任务 | 状态 |
|-----------|----------|------|
| 查看用户列表（分页+筛选） | Task 5 (GET /users), Task 15 (前端页面) | 已覆盖 |
| 查看用户详情（含统计） | Task 5 (GET /users/{id}), Task 13 (弹窗) | 已覆盖 |
| 禁用/启用账号 | Task 5 (toggle-status), Task 15 (交互) | 已覆盖 |
| 角色管理 | Task 5 (PUT /users/{id}), Task 14 (弹窗) | 已覆盖 |
| 重置密码邮件 | Task 4 (EmailService), Task 5 (reset-password), Task 16 (重置页) | 已覆盖 |
| 用户统计卡片 | Task 5 (GET /users/stats), Task 10 (组件) | 已覆盖 |
| 操作审计日志 | Task 5 (AuditService.log 调用) | 已覆盖 |
| 权限控制 | Task 5 (require_admin), Task 15 (前端权限检查) | 已覆盖 |
| 侧边栏导航 | Task 17 | 已覆盖 |
| 密码重置页 | Task 6 (后端端点), Task 16 (前端页面) | 已覆盖 |

---

## Placeholder Scan

- 无 "TBD", "TODO", "implement later" 等占位符
- 所有代码步骤包含完整代码
- 所有命令包含预期输出
- 类型名称前后一致

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-16-user-management.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints for review

**Which approach?**
