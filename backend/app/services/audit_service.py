"""统一审计日志服务"""

from __future__ import annotations

from typing import Optional

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.permission_service import PermissionService


class AuditService:
    """审计日志写入辅助"""

    @staticmethod
    def extract_client_info(request: Request) -> dict:
        """从 Request 提取 ip_address 和 user_agent"""
        return {
            "ip_address": request.client.host if request.client else None,
            "user_agent": (request.headers.get("user-agent", "") or "")[:500],
        }

    @staticmethod
    async def log(
        db: AsyncSession,
        user_id: Optional[str],
        action: str,
        resource_type: str,
        resource_id: str,
        detail: Optional[dict] = None,
        request: Optional[Request] = None,
    ):
        """统一审计写入入口，自动附加 IP/UA"""
        info = AuditService.extract_client_info(request) if request else {}
        await PermissionService().audit(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            detail=detail,
            ip_address=info.get("ip_address"),
            user_agent=info.get("user_agent"),
            db=db,
        )
