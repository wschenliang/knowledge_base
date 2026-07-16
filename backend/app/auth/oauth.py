"""OAuth 2.0 Provider 封装：Microsoft + GitHub。

每个 Provider 实现统一接口：
- build_authorize_url(state, redirect_uri) -> str
- exchange_code(code, redirect_uri) -> {access_token, ...}
- fetch_profile(access_token) -> OAuthProfile

state 参数由路由层生成与校验（带 HMAC 签名 + TTL）。
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from typing import Optional

import httpx
from loguru import logger

from app.config import settings


@dataclass
class OAuthProfile:
    """第三方用户资料（统一格式）"""

    provider: str
    provider_user_id: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None


# ===================== state 签名 =====================

def _state_secret() -> str:
    s = settings.OAUTH_STATE_SECRET or settings.SECRET_KEY
    return s or "oauth-state-fallback"


def _sign_state(payload: dict) -> str:
    """HMAC 签名 state。"""
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    payload_b64 = base64.urlsafe_b64encode(payload_bytes).rstrip(b"=").decode()
    sig = hmac.new(_state_secret().encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{sig}"


def _verify_state(state: str) -> Optional[dict]:
    """校验 state 签名 + TTL。返回 payload 或 None。"""
    try:
        payload_b64, sig = state.split(".", 1)
    except ValueError:
        return None
    expected = hmac.new(_state_secret().encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    pad = "=" * (-len(payload_b64) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + pad))
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    if int(payload.get("ts", 0)) + settings.OAUTH_STATE_TTL < int(time.time()):
        return None
    return payload


def make_state(provider: str, *, bind_user_id: Optional[str] = None) -> str:
    """生成新的 state。bind_user_id 用于"绑定现有账号"场景，前端登录后请求时需传入。"""
    payload = {
        "ts": int(time.time()),
        "nonce": secrets.token_urlsafe(8),
        "provider": provider,
    }
    if bind_user_id:
        payload["bind_user_id"] = bind_user_id
    return _sign_state(payload)


def parse_state(state: str) -> Optional[dict]:
    """校验并解析 state。"""
    return _verify_state(state)


# ===================== Provider 基类 =====================

class OAuthProviderBase:
    """Provider 基类，约定同步接口；具体实现定义类属性。"""

    name: str = ""

    def is_configured(self) -> bool:
        """是否已配置 Client 凭据。前端据此判断按钮是否可点。"""
        return bool(self.client_id and self.client_secret)

    @property
    def client_id(self) -> str:
        raise NotImplementedError

    @property
    def client_secret(self) -> str:
        raise NotImplementedError

    def redirect_uri(self) -> str:
        raise NotImplementedError

    def build_authorize_url(self, state: str, scope: list[str]) -> str:
        raise NotImplementedError

    async def exchange_code(self, code: str) -> dict:
        """code -> access_token（同时返回过期时间、refresh 等）。"""
        raise NotImplementedError

    async def fetch_profile(self, access_token: str) -> OAuthProfile:
        raise NotImplementedError


# ===================== Microsoft =====================

class MicrosoftProvider(OAuthProviderBase):
    """Azure AD (Microsoft Entra ID) 个人 / 企业账号通用。"""

    name = "microsoft"

    @property
    def client_id(self) -> str:
        return settings.MICROSOFT_CLIENT_ID

    @property
    def client_secret(self) -> str:
        return settings.MICROSOFT_CLIENT_SECRET

    def redirect_uri(self) -> str:
        base = settings.OAUTH_BACKEND_BASE_URL.rstrip("/")
        return f"{base}{settings.OAUTH_MICROSOFT_CALLBACK_PATH}"

    def build_authorize_url(self, state: str, scope: list[str]) -> str:
        url = settings.MICROSOFT_AUTHORIZE_URL.format(tenant=settings.MICROSOFT_TENANT)
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "redirect_uri": self.redirect_uri(),
            "response_mode": "query",
            "scope": " ".join(scope),
            "state": state,
            # 强制每次重选账号，避免团队环境缓存
            "prompt": "select_account",
        }
        return _build_url_with_query(url, params)

    async def exchange_code(self, code: str) -> dict:
        token_url = settings.MICROSOFT_TOKEN_URL.format(tenant=settings.MICROSOFT_TENANT)
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                token_url,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": self.redirect_uri(),
                    "scope": "openid profile email",
                },
                headers={"Accept": "application/json"},
            )
        if resp.status_code != 200:
            logger.error(f"Microsoft token exchange failed: {resp.status_code} {resp.text[:300]}")
            raise RuntimeError(f"Microsoft token endpoint returned {resp.status_code}")
        return resp.json()

    async def fetch_profile(self, access_token: str) -> OAuthProfile:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                settings.MICROSOFT_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
        if resp.status_code != 200:
            logger.error(f"Microsoft userinfo failed: {resp.status_code} {resp.text[:300]}")
            raise RuntimeError(f"Microsoft userinfo endpoint returned {resp.status_code}")
        data = resp.json()
        return OAuthProfile(
            provider="microsoft",
            provider_user_id=str(data.get("sub") or data.get("oid") or ""),
            email=data.get("email") or data.get("preferred_username"),
            display_name=data.get("name"),
            avatar_url=None,  # Microsoft Graph 头像需另调 /me/photo，复杂度高；本期先不取
        )


# ===================== GitHub =====================

class GitHubProvider(OAuthProviderBase):
    """GitHub OAuth Apps。"""

    name = "github"

    @property
    def client_id(self) -> str:
        return settings.GITHUB_CLIENT_ID

    @property
    def client_secret(self) -> str:
        return settings.GITHUB_CLIENT_SECRET

    def redirect_uri(self) -> str:
        base = settings.OAUTH_BACKEND_BASE_URL.rstrip("/")
        return f"{base}{settings.OAUTH_GITHUB_CALLBACK_PATH}"

    def build_authorize_url(self, state: str, scope: list[str]) -> str:
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri(),
            "scope": " ".join(scope),
            "state": state,
            "allow_signup": "true",
        }
        return _build_url_with_query(settings.GITHUB_AUTHORIZE_URL, params)

    async def exchange_code(self, code: str) -> dict:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                settings.GITHUB_TOKEN_URL,
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "code": code,
                    "redirect_uri": self.redirect_uri(),
                },
                headers={"Accept": "application/json"},
            )
        if resp.status_code != 200:
            logger.error(f"GitHub token exchange failed: {resp.status_code} {resp.text[:300]}")
            raise RuntimeError(f"GitHub token endpoint returned {resp.status_code}")
        return resp.json()

    async def fetch_profile(self, access_token: str) -> OAuthProfile:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "CogniBase-OAuth",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            user_resp = await client.get(settings.GITHUB_USER_URL, headers=headers)
        if user_resp.status_code != 200:
            logger.error(f"GitHub userinfo failed: {user_resp.status_code} {user_resp.text[:300]}")
            raise RuntimeError(f"GitHub user endpoint returned {user_resp.status_code}")
        user = user_resp.json()
        email = user.get("email")
        # GitHub 主 profile 的 email 经常为 null；fallback 到 /user/emails
        if not email:
            async with httpx.AsyncClient(timeout=15.0) as client:
                emails_resp = await client.get(settings.GITHUB_EMAILS_URL, headers=headers)
            if emails_resp.status_code == 200:
                emails = emails_resp.json() or []
                # 优先取主邮箱且已验证
                primary_verified = next(
                    (e for e in emails if e.get("primary") and e.get("verified")),
                    None,
                )
                if primary_verified:
                    email = primary_verified.get("email")
                else:
                    any_verified = next((e for e in emails if e.get("verified")), None)
                    if any_verified:
                        email = any_verified.get("email")
        return OAuthProfile(
            provider="github",
            provider_user_id=str(user.get("id") or ""),
            email=email,
            display_name=user.get("name") or user.get("login"),
            avatar_url=user.get("avatar_url"),
        )


# ===================== 注册表 & 工具 =====================

PROVIDERS: dict[str, OAuthProviderBase] = {
    "microsoft": MicrosoftProvider(),
    "github": GitHubProvider(),
}


def get_provider(name: str) -> Optional[OAuthProviderBase]:
    return PROVIDERS.get(name)


def all_providers_meta() -> list[dict]:
    """返回当前已配置 / 支持的 Provider 列表，供前端使用。"""
    return [
        {"name": p.name, "configured": p.is_configured()}
        for p in PROVIDERS.values()
    ]


def _q(value) -> str:
    """URL 编码 query 参数值。"""
    from urllib.parse import quote
    return quote(str(value), safe="")


def _build_url_with_query(base: str, params: dict) -> str:
    """拼接带 query string 的 URL。"""
    parts = [f"{k}={_q(v)}" for k, v in params.items()]
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}{'&'.join(parts)}"


# 兼容测试桩：导出 Provider 默认 scope
DEFAULT_SCOPES: dict[str, list[str]] = {
    "microsoft": ["openid", "profile", "email"],
    "github": ["read:user", "user:email"],
}
