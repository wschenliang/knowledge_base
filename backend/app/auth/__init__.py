"""认证模块"""

from __future__ import annotations

import datetime
from typing import Optional

import jwt as pyjwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    """对密码进行哈希（bcrypt 限制最大 72 字节）"""
    # bcrypt 要求密码不超过 72 字节，超长时截断
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > 72:
        password_bytes = password_bytes[:72]
    return pwd_context.hash(password_bytes.decode("utf-8", errors="replace"))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(
    user_id: str,
    username: str,
    role: str = "user",
    expires_delta: Optional[datetime.timedelta] = None,
) -> str:
    """创建 JWT token"""
    to_encode = {
        "sub": user_id,
        "username": username,
        "role": role,
    }
    if expires_delta:
        expire = datetime.datetime.now(datetime.UTC) + expires_delta
    else:
        expire = datetime.datetime.now(datetime.UTC) + datetime.timedelta(days=7)

    to_encode["exp"] = expire
    return pyjwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """解码 JWT token"""
    try:
        payload = pyjwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except pyjwt.PyJWTError:
        return None
