"""Dashboard 统计 API"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_current_user
from app.models.database import get_db
from app.models.document import User
from app.schemas.dashboard import DashboardStatsResponse
from app.services.dashboard_service import DashboardService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    days: int = Query(7, ge=1, le=90, description="时间范围（天）"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取 Dashboard 统计数据

    - 管理员（admin）：返回全站统计
    - 普通用户：仅返回个人相关统计
    """
    service = DashboardService(db, current_user)
    return await service.get_stats(days=days)