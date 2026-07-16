"""认证相关 API 路由"""

from __future__ import annotations

import datetime
import hashlib
import logging
import re
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from loguru import logger

from app.auth import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.config import settings
from app.models.acl import EmailVerificationCode
from app.models.database import get_db
from app.models.document import User
from app.services.audit_service import AuditService
from app.services.email_service import EmailService

router = APIRouter(prefix="/api/v1/auth", tags=["认证"])
security = HTTPBearer()

# ===================== 验证码配置 =====================

VERIFICATION_CODE_TTL_MINUTES = 10       # 验证码有效期
RESEND_COOLDOWN_SECONDS = 60             # 重发冷却时间
CODE_LENGTH = 6                          # 6 位数字验证码
PURPOSE_REGISTER = "register"

# 邮箱前缀中允许的字符集；其他字符会被替换为下划线，避免意外字符或 SQL 注入 risk
_USERNAME_SAFE_RE = re.compile(r"[^a-z0-9_-]+")


def _hash_code(code: str) -> str:
    """对原始验证码做 SHA-256 哈希后再入库。"""
    return hashlib.sha256(code.strip().encode("utf-8")).hexdigest()


def _generate_code() -> str:
    """生成 6 位数字验证码（左填充 0）。"""
    return f"{secrets.randbelow(10 ** CODE_LENGTH):0{CODE_LENGTH}d}"


async def _pick_unique_username(db: AsyncSession, email: str) -> str:
    """异步：从 email 生成一个未被占用的 username。"""
    local = email.split("@", 1)[0].lower()
    safe = _USERNAME_SAFE_RE.sub("_", local).strip("_") or "user"
    base = safe[:30]
    candidate = base
    n = 1
    while True:
        existing = await db.execute(select(User).where(User.username == candidate))
        if existing.scalar_one_or_none() is None:
            return candidate
        suffix = f"-{n}"
        # 限制总体长度 30
        candidate = f"{base[: 30 - len(suffix)]}{suffix}"
        n += 1
        if n > 9999:
            # 几乎不可能；防 OOM
            raise RuntimeError("无法生成唯一 username")


class LoginRequest(BaseModel):
    username: str
    password: str


class SendVerificationCodeRequest(BaseModel):
    """请求发送邮箱验证码。

    - email: 邮箱
    - purpose: 用途，默认 ``register``
    """

    email: EmailStr
    purpose: str = Field(default=PURPOSE_REGISTER, max_length=32)


class VerificationStatusResponse(BaseModel):
    """发送验证码 / 状态查询的返回。"""

    sent: bool
    cooldown_remaining_seconds: int = 0
    message: str = ""


class RegisterRequest(BaseModel):
    """注册请求字段：

    - email：邮箱地址（必填），后端自动从此生成默认 username
    - code：邮箱验证码（必填，6 位数字）
    - password：密码（必填，最少 8 位）
    - confirm_password：确认密码（必填，与 password 严格一致）
    """

    email: EmailStr
    code: str = Field(..., min_length=CODE_LENGTH, max_length=CODE_LENGTH)
    password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(..., min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    username: str
    role: str


class UserResponse(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: str


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """获取当前登录用户"""
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证凭据",
        )

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用",
        )
    return user


@router.post(
    "/send-verification-code",
    response_model=VerificationStatusResponse,
)
async def send_verification_code(
    request: SendVerificationCodeRequest,
    db: AsyncSession = Depends(get_db),
) -> VerificationStatusResponse:
    """请求发送邮箱验证码。

    行为说明：
    - 生成 6 位随机数字验证码，SHA-256 后入库；原始明文通过邮件发送
    - 同一邮箱 60 秒内只发送一次（返回 cooldown 剩余秒数，但不暴露内部状态）
    - TTL：10 分钟（常量 ``VERIFICATION_CODE_TTL_MINUTES``）
    - 返回 ``sent=True`` 表示已发送；返回 ``sent=False`` + cooldown 时表示在冷却中
    """
    email_normalized = request.email.lower().strip()
    now = datetime.datetime.now(datetime.timezone.utc)
    cooldown_until = now - datetime.timedelta(seconds=RESEND_COOLDOWN_SECONDS)

    # 查找上一次发送记录，判断是否在冷却期
    latest = (
        await db.execute(
            select(EmailVerificationCode)
            .where(
                EmailVerificationCode.email == email_normalized,
                EmailVerificationCode.purpose == request.purpose,
            )
            .order_by(EmailVerificationCode.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if latest is not None and latest.created_at > cooldown_until and latest.consumed_at is None:
        # 计算剩余冷却秒数
        remaining = int(
            (latest.created_at + datetime.timedelta(seconds=RESEND_COOLDOWN_SECONDS) - now).total_seconds()
        )
        return VerificationStatusResponse(
            sent=False,
            cooldown_remaining_seconds=max(0, remaining),
            message=f"请等待 {remaining} 秒后再重新发送验证码",
        )

    code = _generate_code()
    code_hash = _hash_code(code)
    expires_at = now + datetime.timedelta(minutes=VERIFICATION_CODE_TTL_MINUTES)

    record = EmailVerificationCode(
        email=email_normalized,
        code_hash=code_hash,
        purpose=request.purpose,
        expires_at=expires_at,
    )
    db.add(record)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    # 默认不报错误（开发环境 SMTP 未配不会一抛）
    try:
        await EmailService.send_verification_code(
            email_normalized,
            code,
            ttl_minutes=VERIFICATION_CODE_TTL_MINUTES,
        )
    except Exception as e:
        logger.warning(f"验证码邮件发送出错（不计错误，但记录失败）: email={email_normalized}, err={e}")

    return VerificationStatusResponse(
        sent=True,
        cooldown_remaining_seconds=RESEND_COOLDOWN_SECONDS,
        message="验证码已发送，请查收邮箱",
    )


@router.post("/register", response_model=TokenResponse)
async def register(request: RegisterRequest, req: Request, db: AsyncSession = Depends(get_db)):
    """注册新用户（邮箱验证码 + 自动生成 username）。

    流程：
    1. 校验两次密码一致
    2. 校验邮箱格式（由 Pydantic EmailStr 保证）
    3. 校验邮箱未被注册
    4. 查找 ``email_verification_codes`` 中本邮箱未消费且未过期的记录，逐个尝试匹配
    5. 从 email 派生 username（重名则加后缀）
    6. 创建 User（display_name 默认同 username，供后续在个人资料修改）
    7. 标记验证码为已消费
    """
    logger.info(f"收到注册请求: email={request.email}")

    # 1) 密码一致性
    if request.password != request.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="两次输入的密码不一致",
        )

    email_normalized = request.email.lower().strip()

    # 2) 邮箱是否已注册
    existing_email = (
        await db.execute(select(User).where(User.email == email_normalized))
    ).scalar_one_or_none()
    if existing_email is not None:
        logger.warning(f"注册失败: 邮箱已被注册 - {email_normalized}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该邮箱已注册，请直接登录",
        )

    # 3) 校验验证码：在同 email + purpose=register 范围内查找有效且未消费的记录
    code_hash = _hash_code(request.code)
    now = datetime.datetime.now(datetime.timezone.utc)
    candidate_records = (
        await db.execute(
            select(EmailVerificationCode)
            .where(
                EmailVerificationCode.email == email_normalized,
                EmailVerificationCode.purpose == PURPOSE_REGISTER,
                EmailVerificationCode.consumed_at.is_(None),
                EmailVerificationCode.expires_at > now,
            )
            .order_by(EmailVerificationCode.created_at.desc())
        )
    ).scalars().all()

    matched = next(
        (r for r in candidate_records if r.code_hash == code_hash),
        None,
    )
    if matched is None:
        # 剩余重试次数友好提示：仍然允许用户重发
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码错误或已过期，请重新获取",
        )

    try:
        # 4) 生成 username
        username = await _pick_unique_username(db, email_normalized)

        # 5) 创建用户：display_name 默认同 username，允许后续在个人资料修改
        user = User(
            username=username,
            email=email_normalized,
            hashed_password=hash_password(request.password),
            display_name=username,
            password_set=True,
        )
        db.add(user)
        await db.flush()

        # 6) 标记验证码消费
        matched.consumed_at = now
        await db.flush()
        await db.refresh(user)

        logger.info(f"用户注册成功: id={user.id}, username={user.username}")

        await AuditService.log(
            db=db,
            user_id=user.id,
            action="auth.register",
            resource_type="user",
            resource_id=user.id,
            detail={"email": user.email, "username": user.username},
            request=req,
        )
        await db.commit()

        token = create_access_token(
            user_id=user.id,
            username=user.username,
            role=user.role,
        )
        return TokenResponse(
            access_token=token,
            user_id=user.id,
            username=user.username,
            role=user.role,
        )
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.opt(exception=True).error(
            f"注册失败 - email={email_normalized}, 错误: {e}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"注册失败: {str(e)}",
        )


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, req: Request, db: AsyncSession = Depends(get_db)):
    """用户登录"""
    logger.info(f"收到登录请求: username={request.username}")
    try:
        result = await db.execute(select(User).where(User.username == request.username))
        user = result.scalar_one_or_none()

        if user is None or not verify_password(request.password, user.hashed_password):
            logger.warning(f"登录失败: 用户名或密码错误 - {request.username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户名或密码错误",
            )

        # OAuth-only 账号没有设置过密码：明确提示走第三方登入，避免与"用户名或密码错误"混淆
        if not user.password_set:
            logger.warning(
                f"登录失败: 账号尚未设置本地密码（OAuth 第三方登入用户）- {request.username}"
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="该账号未设置本地密码，请使用第三方账号登入或在个人设置中补设密码",
            )

        if not user.is_active:
            logger.warning(f"登录失败: 用户已被禁用 - {request.username}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="用户已被禁用",
            )

        user.last_login_at = datetime.datetime.now(datetime.timezone.utc)
        await db.flush()

        token = create_access_token(
            user_id=user.id,
            username=user.username,
            role=user.role,
        )

        logger.info(f"用户登录成功: id={user.id}, username={user.username}")

        # 审计日志
        await AuditService.log(
            db=db,
            user_id=user.id,
            action="auth.login",
            resource_type="user",
            resource_id=user.id,
            detail={"username": user.username},
            request=req,
        )
        await db.commit()

        return TokenResponse(
            access_token=token,
            user_id=user.id,
            username=user.username,
            role=user.role,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.opt(exception=True).error(
            f"登录失败 - username={request.username}, 错误: {e}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"登录失败: {str(e)}",
        )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """获取当前用户信息"""
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        display_name=current_user.display_name,
        role=current_user.role,
    )


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

    user.hashed_password = hash_password(request.new_password)
    # 若该用户原本是 OAuth 注册（password_set=False），现在补设了密码，
    # 必须把 password_set 置回 True，否则 login() 仍会拦截。
    user.password_set = True
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
