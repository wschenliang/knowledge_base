"""权限依赖"""

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_current_user
from app.models.database import get_db
from app.models.document import Collection, User
from app.services.permission_service import PermissionService, ROLE_PRIORITY


async def require_admin(current_user: User = Depends(get_current_user)):
    """要求管理员权限"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限",
        )
    return current_user


async def require_collection_role(
    request: Request,
    min_role: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> tuple[User, Collection]:
    """要求用户对某 KB 拥有指定级别或更高级别权限。

    自动从 ``request.path_params`` 提取 ``collection_id``。
    如果端点的路径参数是 ``document_id`` 而需要 ``collection_id``，
    调用方应在调用前先设置 ``request.path_params["collection_id"]``。

    Args:
        min_role: 'viewer' | 'editor' | 'owner'

    Returns:
        (current_user, collection)

    Raises:
        HTTPException 403 / 404
    """
    if min_role not in ROLE_PRIORITY:
        raise ValueError(f"Invalid min_role: {min_role}")

    # 从路径参数提取 collection_id
    collection_id = request.path_params.get("collection_id")

    # Admin 短路：放行任何 KB
    if current_user.role == "admin":
        if not collection_id:
            return current_user, None  # type: ignore[return-value]
        result = await db.execute(
            select(Collection).where(Collection.id == collection_id)
        )
        return current_user, result.scalar_one_or_none()

    if not collection_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无法从路径提取 collection_id",
        )

    # 获取 collection
    result = await db.execute(
        select(Collection).where(Collection.id == collection_id)
    )
    collection = result.scalar_one_or_none()
    if collection is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="知识库不存在",
        )

    # 检查 ACL
    svc = PermissionService()
    user_role = await svc.get_role(current_user.id, collection_id, db)
    if not user_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问该知识库",
        )

    if ROLE_PRIORITY[user_role] < ROLE_PRIORITY[min_role]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"需要 {min_role} 或更高权限",
        )

    return current_user, collection