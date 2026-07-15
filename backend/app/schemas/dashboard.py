"""Dashboard 统计响应 Pydantic 模型"""

from __future__ import annotations

import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class DashboardKPI(BaseModel):
    """KPI 卡片数据"""
    total_users: int = 0
    total_collections: int = 0
    total_documents: int = 0
    total_conversations: int = 0
    total_messages: int = 0
    today_messages: int = 0


class DailyCount(BaseModel):
    """每日计数"""
    date: str  # YYYY-MM-DD
    count: int


class TrendData(BaseModel):
    """趋势数据"""
    daily_messages: list[DailyCount] = []
    daily_documents: list[DailyCount] = []


class TopCollectionItem(BaseModel):
    """热门知识库条目"""
    id: str
    name: str
    question_count: int
    document_count: int
    owner_username: Optional[str] = None


class TopUserItem(BaseModel):
    """活跃用户条目"""
    user_id: str
    username: str
    display_name: Optional[str] = None
    message_count: int
    conversation_count: int


class TopQuestionItem(BaseModel):
    """高频问题条目"""
    query: str
    count: int
    last_asked_at: Optional[datetime.datetime] = None


class DashboardStatsResponse(BaseModel):
    """Dashboard 统计响应"""
    scope: Literal["admin", "user"]
    range_days: int
    generated_at: datetime.datetime

    kpi: DashboardKPI
    trends: TrendData

    top_collections: list[TopCollectionItem] = []
    top_users: Optional[list[TopUserItem]] = None  # 仅 admin 范围返回
    top_questions: list[TopQuestionItem] = []

    model_config = {"from_attributes": True}