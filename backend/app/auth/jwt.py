"""认证相关 API 路由"""

from __future__ import annotations

import datetime
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from loguru import logger

from app.auth import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.models.database import get_db
from app.models.document import User
from app.services.audit_service import AuditService

router = APIRouter(prefix="/api/v1/auth", tags=["认证"])
security = HTTPBearer()


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    display_name: Optional[str] = None


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


@router.post("/register", response_model=TokenResponse)
async def register(request: RegisterRequest, req: Request, db: AsyncSession = Depends(get_db)):
    """注册新用户"""
    logger.info(f"收到注册请求: username={request.username}")
    try:
        # 检查用户名是否已存在
        result = await db.execute(select(User).where(User.username == request.username))
        if result.scalar_one_or_none():
            logger.warning(f"注册失败: 用户名已存在 - {request.username}")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="用户名已存在",
            )

        # 检查邮箱是否已存在
        if request.email:
            result = await db.execute(select(User).where(User.email == request.email))
            if result.scalar_one_or_none():
                logger.warning(f"注册失败: 邮箱已被注册 - {request.email}")
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="邮箱已被注册",
                )

        user = User(
            username=request.username,
            hashed_password=hash_password(request.password),
            email=request.email,
            display_name=request.display_name or request.username,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)

        logger.info(f"用户注册成功: id={user.id}, username={user.username}")

        # 审计日志
        await AuditService.log(
            db=db,
            user_id=user.id,
            action="auth.register",
            resource_type="user",
            resource_id=user.id,
            detail={"username": user.username},
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
        logger.opt(exception=True).error(
            f"注册失败 - username={request.username}, 错误: {e}"
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
