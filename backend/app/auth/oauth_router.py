"""OAuth 2.0 路由：跳转 / 回调 / 绑定 / 解绑 / 列表。

端点清单
--------
- GET  /api/v1/auth/oauth/providers
    公共：返回当前已配置的 Provider 列表，供前端按需隐藏按钮。

- GET  /api/v1/auth/oauth/{provider}/login
    公共：生成 HMAC state 并 302 跳到 Provider 授权页。
    支持 `?bind_user_id=...` 用于绑定流程（可选；推荐改用 POST /bind）。

- GET  /api/v1/auth/oauth/{provider}/callback
    Provider 回跳入口。校验 state → 换 token → 拉 profile →
    找/建/绑本地用户 → 发 JWT → 302 跳到前端 /oauth-callback。

- POST /api/v1/auth/oauth/bind
    需要登录：已登录用户发起"再绑定一个 Provider"。
    返回 authorize_url，前端跳转。

- GET  /api/v1/auth/oauth/bindings
    需要登录：列出当前用户已绑定的全部 Provider，以及 password_set 标志。

- DELETE /api/v1/auth/oauth/bind/{provider}
    需要登录：解绑指定 Provider。要求至少仍保留一种登录方式。

设计要点
--------
- state 用 HMAC 签名（app.auth.oauth），无需入库；10 min TTL。
- 以 `(provider, provider_user_id)` 为优先；email 仅用于"自动关联现有账号"。
- 新建用户时 `password_set=False`，并把 `hashed_password` 写一个占位哈希，
  防止出现 password_login 误登入（jwt.login 会再校验 password_set）。
- callback 通过 302 跳到前端 landing，前端按 `?action=` 分流
  (`login` / `signup` / `bind_existing` / `bind_success` / `error`)。
"""

from __future__ import annotations

import datetime
import secrets
from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from loguru import logger

from app.auth import create_access_token, hash_password
from app.auth.jwt import get_current_user
from app.auth.oauth import (
    DEFAULT_SCOPES,
    OAuthProfile,
    PROVIDERS,
    get_provider,
    make_state,
    parse_state,
)
from app.config import settings
from app.models.acl import OAuthAccount
from app.models.database import get_db
from app.models.document import User
from app.services.audit_service import AuditService


router = APIRouter(prefix="/api/v1/auth/oauth", tags=["OAuth"])


# ===================== Schemas =====================

class OAuthBindingInfo(BaseModel):
    provider: str
    provider_email: Optional[str] = None
    provider_display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: Optional[str] = None


class BindingsResponse(BaseModel):
    bindings: list[OAuthBindingInfo]
    password_set: bool


class BindStartRequest(BaseModel):
    provider: str


class BindStartResponse(BaseModel):
    authorize_url: str


# ===================== 公共端点 =====================

@router.get("/providers")
async def list_providers() -> dict:
    """列出当前所有 Provider 及其 `is_configured` 状态，供前端按需显示按钮。"""
    return {
        "providers": [
            {"name": p.name, "configured": p.is_configured()}
            for p in PROVIDERS.values()
        ]
    }


@router.get("/{provider}/login")
async def oauth_login(
    provider: str,
    request: Request,
    bind_user_id: Optional[str] = Query(default=None),
):
    """OAuth 登录 / 注册 / 绑定入口。

    - 单纯登录注册：前端直接 `<a href="/api/v1/auth/oauth/microsoft/login">`
    - 绑定：带 `?bind_user_id=<当前用户id>` 即可；也可用 POST /bind 拿到 authorize_url
    """
    p = get_provider(provider)
    if p is None:
        raise HTTPException(status_code=404, detail=f"未知的登录方式: {provider}")
    if not p.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{provider} 登录未配置 Client 凭据",
        )

    state = make_state(provider, bind_user_id=bind_user_id)
    scope = DEFAULT_SCOPES.get(provider, [])
    authorize_url = p.build_authorize_url(state=state, scope=scope)

    logger.info(
        f"OAuth login: provider={provider}, bind_user_id={bind_user_id}, "
        f"ip={request.client.host if request.client else 'unknown'}"
    )
    return RedirectResponse(url=authorize_url, status_code=302)


@router.get("/{provider}/callback")
async def oauth_callback(
    request: Request,
    provider: str,
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    error_description: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """OAuth 回调。

    优先处理 Provider 返回的 `error`（如用户拒绝授权）；
    通过 state 校验 → code 换 token → 拉 profile →
    根据 state.bind_user_id 区分"绑定"或"登录/注册"。
    """
    p = get_provider(provider)
    if p is None:
        raise HTTPException(status_code=404, detail=f"未知的登录方式: {provider}")
    if not p.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{provider} 登录未配置 Client 凭据",
        )

    # 1) Provider 返回的错误（用户拒绝授权等）
    if error:
        logger.info(
            f"OAuth callback error: provider={provider}, error={error}, "
            f"desc={error_description}"
        )
        return _redirect_frontend(
            provider=provider,
            action="error",
            error=error_description or error,
        )

    if not code or not state:
        return _redirect_frontend(
            provider=provider, action="error", error="missing_code_or_state"
        )

    # 2) state 校验（HMAC 签名 + TTL）
    payload = parse_state(state)
    if payload is None or payload.get("provider") != provider:
        logger.warning(
            f"OAuth state invalid: provider={provider}, ip={request.client.host if request.client else '?'}"
        )
        return _redirect_frontend(
            provider=provider, action="error", error="invalid_state"
        )
    bind_user_id: Optional[str] = payload.get("bind_user_id")

    # 3) code → token
    try:
        token_data = await p.exchange_code(code)
    except Exception as e:
        logger.opt(exception=True).error(
            f"OAuth token exchange failed: provider={provider}"
        )
        return _redirect_frontend(
            provider=provider, action="error", error="token_exchange_failed"
        )
    access_token = token_data.get("access_token")
    if not access_token:
        return _redirect_frontend(
            provider=provider, action="error", error="no_access_token"
        )

    # 4) token → profile
    try:
        profile = await p.fetch_profile(access_token)
    except Exception as e:
        logger.opt(exception=True).error(
            f"OAuth profile fetch failed: provider={provider}"
        )
        return _redirect_frontend(
            provider=provider, action="error", error="profile_fetch_failed"
        )
    if not profile.provider_user_id:
        return _redirect_frontend(
            provider=provider, action="error", error="empty_provider_user_id"
        )

    # 5) 分流：绑定 vs 登录/注册
    if bind_user_id:
        return await _complete_bind(
            db=db,
            request=request,
            provider=provider,
            profile=profile,
            bind_user_id=bind_user_id,
        )
    return await _complete_login_or_signup(
        db=db,
        request=request,
        provider=provider,
        profile=profile,
    )


# ===================== 需要登录的端点 =====================

@router.get("/bindings", response_model=BindingsResponse)
async def list_bindings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """当前用户的 OAuth 绑定列表（用于 ProfileDialog 渲染）。"""
    result = await db.execute(
        select(OAuthAccount).where(OAuthAccount.user_id == current_user.id)
    )
    binds = result.scalars().all()
    return BindingsResponse(
        bindings=[
            OAuthBindingInfo(
                provider=b.provider,
                provider_email=b.provider_email,
                provider_display_name=b.provider_display_name,
                avatar_url=b.avatar_url,
                created_at=b.created_at.isoformat() if b.created_at else None,
            )
            for b in binds
        ],
        password_set=bool(current_user.password_set),
    )


@router.post("/bind", response_model=BindStartResponse)
async def start_bind(
    payload: BindStartRequest,
    current_user: User = Depends(get_current_user),
):
    """已登录用户发起"绑定新 Provider"。返回 authorize_url 让前端跳转。"""
    provider = payload.provider
    p = get_provider(provider)
    if p is None:
        raise HTTPException(status_code=404, detail=f"未知的登录方式: {provider}")
    if not p.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"{provider} 登录未配置 Client 凭据",
        )

    state = make_state(provider, bind_user_id=current_user.id)
    scope = DEFAULT_SCOPES.get(provider, [])
    authorize_url = p.build_authorize_url(state=state, scope=scope)
    logger.info(
        f"OAuth bind start: user_id={current_user.id}, provider={provider}"
    )
    return BindStartResponse(authorize_url=authorize_url)


@router.delete("/bind/{provider}")
async def unbind_provider(
    provider: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """解绑指定 Provider。

    至少仍保留一种登录方式（password_set=True 或其他 Provider 绑定）；
    否则返回 400 让前端提示用户先设置密码或绑定其他 Provider。
    """
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail=f"未知的登录方式: {provider}")

    result = await db.execute(
        select(OAuthAccount).where(
            OAuthAccount.user_id == current_user.id,
            OAuthAccount.provider == provider,
        )
    )
    binding = result.scalar_one_or_none()
    if binding is None:
        raise HTTPException(status_code=404, detail="未绑定该 Provider")

    # 计算其他登录方式
    other_result = await db.execute(
        select(OAuthAccount).where(
            OAuthAccount.user_id == current_user.id,
            OAuthAccount.provider != provider,
        )
    )
    has_other_provider = other_result.scalar_one_or_none() is not None
    has_password = bool(current_user.password_set)

    if not has_other_provider and not has_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="解绑后该账号没有任何登录方式，请先设置密码或绑定其他 Provider",
        )

    provider_user_id = binding.provider_user_id
    await db.delete(binding)
    await db.flush()

    await AuditService.log(
        db=db,
        user_id=current_user.id,
        action="auth.oauth.unbind",
        resource_type="user",
        resource_id=current_user.id,
        detail={"provider": provider, "provider_user_id": provider_user_id},
        request=request,
    )
    await db.commit()

    logger.info(
        f"OAuth unbound: user_id={current_user.id}, provider={provider}"
    )
    return {
        "message": f"已解绑 {provider}",
        "provider": provider,
    }


# ===================== 内部：完成登录/注册 =====================

async def _complete_login_or_signup(
    *,
    db: AsyncSession,
    request: Request,
    provider: str,
    profile: OAuthProfile,
) -> RedirectResponse:
    """根据 OAuth profile 找到 / 创建 / 关联本地用户并签发 JWT。

    动作（写在 redirect 的 `action` 参数）：
    - `login`：已有绑定，直接登录。
    - `bind_existing`：按 email 找到现有用户，自动追加一条绑定。
    - `signup`：全新用户，`password_set=False`。
    """
    user: Optional[User] = None
    action = "error"

    # 1) 先看 (provider, provider_user_id) 是否已绑定
    bind_result = await db.execute(
        select(OAuthAccount).where(
            OAuthAccount.provider == provider,
            OAuthAccount.provider_user_id == profile.provider_user_id,
        )
    )
    bind = bind_result.scalar_one_or_none()
    if bind:
        user = await db.get(User, bind.user_id)
        if user is not None:
            action = "login"
        else:
            # 防御：绑定指向的用户已被删除，视为孤立记录，重绑到 email 用户或新建
            logger.warning(
                f"孤立 OAuthAccount: id={bind.id}, provider={provider}, "
                f"provider_user_id={profile.provider_user_id}"
            )
            await db.delete(bind)
            await db.flush()

    # 2) email 命中现有用户 → 追加绑定
    if user is None and profile.email:
        u_result = await db.execute(select(User).where(User.email == profile.email))
        user = u_result.scalar_one_or_none()
        if user:
            new_bind = OAuthAccount(
                user_id=user.id,
                provider=provider,
                provider_user_id=profile.provider_user_id,
                provider_email=profile.email,
                provider_display_name=profile.display_name,
                avatar_url=profile.avatar_url,
            )
            db.add(new_bind)
            await db.flush()
            action = "bind_existing"

    # 3) 全新用户
    if user is None:
        user = await _create_oauth_user(
            db=db, provider=provider, profile=profile
        )
        action = "signup"

    if user is None:
        return _redirect_frontend(
            provider=provider, action="error", error="user_resolution_failed"
        )

    # 更新 last_login_at
    user.last_login_at = datetime.datetime.now(datetime.timezone.utc)

    token = create_access_token(
        user_id=user.id,
        username=user.username,
        role=user.role,
    )

    # 审计（不阻塞登录）
    audit_action_map = {
        "login": "auth.oauth.login",
        "bind_existing": "auth.oauth.bind_existing",
        "signup": "auth.oauth.signup",
    }
    try:
        await AuditService.log(
            db=db,
            user_id=user.id,
            action=audit_action_map.get(action, "auth.oauth.login"),
            resource_type="user",
            resource_id=user.id,
            detail={"provider": provider, "action": action},
            request=request,
        )
    except Exception:
        logger.opt(exception=True).warning("OAuth 审计失败，已忽略")

    await db.commit()

    logger.info(
        f"OAuth login/signup: provider={provider}, action={action}, "
        f"user_id={user.id}"
    )
    return _redirect_frontend(
        provider=provider,
        action=action,
        token=token,
        username=user.username,
        user_id=user.id,
    )


async def _create_oauth_user(
    *,
    db: AsyncSession,
    provider: str,
    profile: OAuthProfile,
) -> User:
    """创建一个 OAuth-only 本地账号。

    - `password_set=False`：前端可在 ProfileDialog 引导补设密码。
    - `hashed_password`：写一个不可用的占位（随机 token 哈希），
      防止任何密码误登入。
    - 用户名格式 `{provider}_{provider_user_id[:8]}`，冲突则追加数字后缀。
    """
    base = f"{provider}_{(profile.provider_user_id or 'unknown')[:8]}"
    username = base
    suffix = 2
    while True:
        exists = await db.execute(
            select(User).where(User.username == username)
        )
        if exists.scalar_one_or_none() is None:
            break
        username = f"{base}_{suffix}"
        suffix += 1

    placeholder = secrets.token_urlsafe(32)  # 43 字符随机串，bcrypt 合规
    display = profile.display_name
    if not display and profile.email:
        display = profile.email.split("@", 1)[0]

    user = User(
        username=username,
        email=profile.email,
        display_name=display or username,
        hashed_password=hash_password(placeholder),
        password_set=False,
        role="user",
    )
    db.add(user)
    await db.flush()

    new_bind = OAuthAccount(
        user_id=user.id,
        provider=provider,
        provider_user_id=profile.provider_user_id,
        provider_email=profile.email,
        provider_display_name=profile.display_name,
        avatar_url=profile.avatar_url,
    )
    db.add(new_bind)
    await db.flush()

    return user


# ===================== 内部：完成绑定 =====================

async def _complete_bind(
    *,
    db: AsyncSession,
    request: Request,
    provider: str,
    profile: OAuthProfile,
    bind_user_id: str,
) -> RedirectResponse:
    """完成"绑定当前 OAuth 账号到 bind_user_id"。

    冲突规则：
    - 该 (provider, provider_user_id) 已被其它用户绑定 → bind_error
    - 当前用户已经绑定过该 provider → bind_error（同 provider 仅一条）
    - 同样地重复绑定同 (provider, provider_user_id) 对当前用户 → 视为幂等成功
    """
    user = await db.get(User, bind_user_id)
    if user is None or not user.is_active:
        return _redirect_frontend(
            provider=provider, action="bind_error", error="user_not_found_or_inactive"
        )

    # (provider, provider_user_id) 已被绑定到谁？
    existing_result = await db.execute(
        select(OAuthAccount).where(
            OAuthAccount.provider == provider,
            OAuthAccount.provider_user_id == profile.provider_user_id,
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        if existing.user_id == user.id:
            # 重复点击 → 幂等成功
            logger.info(
                f"OAuth bind idempotent: user_id={user.id}, provider={provider}"
            )
            await db.commit()
            return _redirect_frontend(provider=provider, action="bind_success")
        return _redirect_frontend(
            provider=provider,
            action="bind_error",
            error="already_bound_to_other_user",
        )

    # 当前用户是否已绑定过该 provider？
    already_result = await db.execute(
        select(OAuthAccount).where(
            OAuthAccount.user_id == user.id,
            OAuthAccount.provider == provider,
        )
    )
    if already_result.scalar_one_or_none() is not None:
        return _redirect_frontend(
            provider=provider,
            action="bind_error",
            error="provider_already_bound",
        )

    bind = OAuthAccount(
        user_id=user.id,
        provider=provider,
        provider_user_id=profile.provider_user_id,
        provider_email=profile.email,
        provider_display_name=profile.display_name,
        avatar_url=profile.avatar_url,
    )
    db.add(bind)
    await db.flush()

    try:
        await AuditService.log(
            db=db,
            user_id=user.id,
            action="auth.oauth.bind",
            resource_type="user",
            resource_id=user.id,
            detail={"provider": provider, "provider_user_id": profile.provider_user_id},
            request=request,
        )
    except Exception:
        logger.opt(exception=True).warning("OAuth 绑定审计失败，已忽略")

    await db.commit()

    logger.info(f"OAuth bound: user_id={user.id}, provider={provider}")
    return _redirect_frontend(provider=provider, action="bind_success")


# ===================== 工具 =====================

def _redirect_frontend(
    *,
    provider: str,
    action: str,
    token: Optional[str] = None,
    username: Optional[str] = None,
    user_id: Optional[str] = None,
    error: Optional[str] = None,
) -> RedirectResponse:
    """拼前端 landing URL 并 302。

    落地 URL：`{OAUTH_FRONTEND_CALLBACK}?provider=...&action=...&token=...&error=...`
    前端 /oauth-callback 按这些参数分流。
    """
    params: list[tuple[str, str]] = [("provider", provider), ("action", action)]
    if token:
        params.append(("token", token))
    if username:
        params.append(("username", username))
    if user_id:
        params.append(("user_id", user_id))
    if error:
        params.append(("error", error))

    base = settings.OAUTH_FRONTEND_CALLBACK.rstrip("/")
    url = f"{base}?{urlencode(params)}"
    return RedirectResponse(url=url, status_code=302)
