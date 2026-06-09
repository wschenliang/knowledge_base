"""权限依赖"""

from fastapi import Depends, HTTPException, status

from app.auth.jwt import get_current_user
from app.models.document import User


async def require_admin(current_user: User = Depends(get_current_user)):
    """要求管理员权限"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限",
        )
    return current_user
