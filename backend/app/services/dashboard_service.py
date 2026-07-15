"""Dashboard 聚合统计服务"""

from __future__ import annotations

import datetime
import logging
import re
from collections import Counter

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.acl import CollectionACL
from app.models.document import Collection, Conversation, Document, Message, User
from app.schemas.dashboard import (
    DashboardKPI,
    DashboardStatsResponse,
    DailyCount,
    TopCollectionItem,
    TopQuestionItem,
    TopUserItem,
    TrendData,
)

logger = logging.getLogger(__name__)


# 中文停用词（极简版，覆盖常见功能词）
STOP_WORDS = {
    "的", "了", "是", "在", "我", "你", "他", "她", "它", "们",
    "和", "与", "或", "但", "而", "把", "被", "对", "从", "到",
    "为", "于", "以", "及", "等", "之", "其", "此", "那", "哪",
    "什么", "怎么", "如何", "怎样", "为什么", "可以", "不能",
    "吗", "呢", "啊", "吧", "哦", "嗯", "哈", "呀", "嘛", "啦",
    "请", "帮我", "一个", "一下", "一些", "这个", "那个", "这些", "那些",
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "to", "of", "in", "on", "at", "by", "for", "with", "and", "or",
}


class DashboardService:
    """Dashboard 聚合统计服务"""

    def __init__(self, db: AsyncSession, current_user: User):
        self.db = db
        self.current_user = current_user
        self.is_admin = current_user.role == "admin"

    def _range_start(self, days: int) -> datetime.datetime:
        """计算时间范围起点"""
        now = datetime.datetime.now(datetime.timezone.utc)
        return now - datetime.timedelta(days=days)

    async def get_stats(self, days: int = 7) -> DashboardStatsResponse:
        """获取 Dashboard 统计"""
        start = self._range_start(days)
        today_start = datetime.datetime.now(datetime.timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        now = datetime.datetime.now(datetime.timezone.utc)

        kpi = await self._get_kpi(start, today_start)
        trends = await self._get_trends(start, days)
        top_collections = await self._get_top_collections(start)
        top_users = await self._get_top_users(start) if self.is_admin else None
        top_questions = await self._get_top_questions(start)

        return DashboardStatsResponse(
            scope="admin" if self.is_admin else "user",
            range_days=days,
            generated_at=now,
            kpi=kpi,
            trends=trends,
            top_collections=top_collections,
            top_users=top_users,
            top_questions=top_questions,
        )

    async def _get_kpi(
        self, start: datetime.datetime, today_start: datetime.datetime
    ) -> DashboardKPI:
        """获取 KPI 数据"""
        # 全站范围统计：用户/KB/文档
        total_users = (await self.db.execute(
            select(func.count(User.id))
        )).scalar() or 0
        total_collections = (await self.db.execute(
            select(func.count(Collection.id))
        )).scalar() or 0
        total_documents = (await self.db.execute(
            select(func.count(Document.id))
        )).scalar() or 0

        # 消息/对话 按范围统计
        # Message 没有 user_id，需要 JOIN Conversation
        if self.is_admin:
            msg_q = (
                select(func.count(Message.id))
                .join(Conversation, Conversation.id == Message.conversation_id)
                .where(Message.created_at >= start)
            )
            conv_q = select(func.count(Conversation.id)).where(
                Conversation.created_at >= start
            )
        else:
            msg_q = (
                select(func.count(Message.id))
                .join(Conversation, Conversation.id == Message.conversation_id)
                .where(
                    and_(
                        Message.created_at >= start,
                        Conversation.user_id == self.current_user.id,
                    )
                )
            )
            conv_q = select(func.count(Conversation.id)).where(
                and_(
                    Conversation.created_at >= start,
                    Conversation.user_id == self.current_user.id,
                )
            )

        total_messages = (await self.db.execute(msg_q)).scalar() or 0
        total_conversations = (await self.db.execute(conv_q)).scalar() or 0

        # 今日消息
        if self.is_admin:
            today_q = (
                select(func.count(Message.id))
                .join(Conversation, Conversation.id == Message.conversation_id)
                .where(Message.created_at >= today_start)
            )
        else:
            today_q = (
                select(func.count(Message.id))
                .join(Conversation, Conversation.id == Message.conversation_id)
                .where(
                    and_(
                        Message.created_at >= today_start,
                        Conversation.user_id == self.current_user.id,
                    )
                )
            )
        today_messages = (await self.db.execute(today_q)).scalar() or 0

        # user 范围：用户数固定为 1
        if not self.is_admin:
            total_users = 1

        return DashboardKPI(
            total_users=total_users,
            total_collections=total_collections,
            total_documents=total_documents,
            total_conversations=total_conversations,
            total_messages=total_messages,
            today_messages=today_messages,
        )

    async def _get_trends(
        self, start: datetime.datetime, days: int
    ) -> TrendData:
        """获取趋势数据"""
        # 每日消息数（user 角色）
        msg_base = (
            select(
                func.date(Message.created_at).label("date"),
                func.count(Message.id).label("count"),
            )
            .join(Conversation, Conversation.id == Message.conversation_id)
            .where(
                and_(Message.role == "user", Message.created_at >= start)
            )
        )
        if not self.is_admin:
            msg_base = msg_base.where(Conversation.user_id == self.current_user.id)
        msg_base = msg_base.group_by(func.date(Message.created_at)).order_by("date")

        result = await self.db.execute(msg_base)
        daily_messages = [
            DailyCount(date=str(row.date), count=row.count)
            for row in result.all()
        ]

        # 每日文档数（仅 admin）
        daily_documents = []
        if self.is_admin:
            doc_base = (
                select(
                    func.date(Document.created_at).label("date"),
                    func.count(Document.id).label("count"),
                )
                .where(Document.created_at >= start)
                .group_by(func.date(Document.created_at))
                .order_by("date")
            )
            result = await self.db.execute(doc_base)
            daily_documents = [
                DailyCount(date=str(row.date), count=row.count)
                for row in result.all()
            ]

        return TrendData(
            daily_messages=_fill_missing_dates(daily_messages, days),
            daily_documents=_fill_missing_dates(daily_documents, days),
        )

    async def _get_top_collections(
        self, start: datetime.datetime
    ) -> list[TopCollectionItem]:
        """获取热门知识库"""
        limit = 10 if self.is_admin else 5

        # 子查询：每个 KB 在范围内的 user 消息数
        msg_sub = (
            select(
                Conversation.collection_id.label("collection_id"),
                func.count(Message.id).label("question_count"),
            )
            .join(Message, Message.conversation_id == Conversation.id)
            .where(and_(Message.role == "user", Message.created_at >= start))
            .group_by(Conversation.collection_id)
            .subquery()
        )

        base = (
            select(
                Collection.id,
                Collection.name,
                Collection.document_count,
                Collection.owner_id,
                User.username,
                func.coalesce(msg_sub.c.question_count, 0).label("question_count"),
            )
            .outerjoin(msg_sub, msg_sub.c.collection_id == Collection.id)
            .outerjoin(User, User.id == Collection.owner_id)
        )

        # user 范围：只统计有 ACL 授权的 KB
        if not self.is_admin:
            base = base.join(
                CollectionACL,
                and_(
                    CollectionACL.collection_id == Collection.id,
                    CollectionACL.user_id == self.current_user.id,
                ),
            )

        base = base.order_by(
            func.coalesce(msg_sub.c.question_count, 0).desc()
        ).limit(limit)

        result = await self.db.execute(base)
        return [
            TopCollectionItem(
                id=row.id,
                name=row.name,
                question_count=row.question_count or 0,
                document_count=row.document_count or 0,
                owner_username=row.username,
            )
            for row in result.all()
        ]

    async def _get_top_users(
        self, start: datetime.datetime
    ) -> list[TopUserItem]:
        """获取活跃用户（仅 admin）"""
        # JOIN Message -> Conversation -> User
        msg_count_sub = (
            select(
                Conversation.user_id.label("user_id"),
                func.count(Message.id).label("msg_count"),
            )
            .join(Message, Message.conversation_id == Conversation.id)
            .where(Message.created_at >= start)
            .group_by(Conversation.user_id)
            .subquery()
        )

        conv_count_sub = (
            select(
                Conversation.user_id.label("user_id"),
                func.count(Conversation.id).label("conv_count"),
            )
            .where(Conversation.created_at >= start)
            .group_by(Conversation.user_id)
            .subquery()
        )

        base = (
            select(
                User.id,
                User.username,
                User.display_name,
                func.coalesce(msg_count_sub.c.msg_count, 0).label("message_count"),
                func.coalesce(conv_count_sub.c.conv_count, 0).label("conversation_count"),
            )
            .outerjoin(msg_count_sub, msg_count_sub.c.user_id == User.id)
            .outerjoin(conv_count_sub, conv_count_sub.c.user_id == User.id)
            .where(User.is_active == True)  # noqa: E712
            .order_by(func.coalesce(msg_count_sub.c.msg_count, 0).desc())
            .limit(10)
        )

        result = await self.db.execute(base)
        items = []
        for row in result.all():
            if row.message_count == 0 and row.conversation_count == 0:
                continue
            items.append(TopUserItem(
                user_id=row.id,
                username=row.username,
                display_name=row.display_name,
                message_count=row.message_count,
                conversation_count=row.conversation_count,
            ))
        return items[:10]

    async def _get_top_questions(
        self, start: datetime.datetime
    ) -> list[TopQuestionItem]:
        """获取高频问题（简单词频统计）"""
        limit_n = 20 if self.is_admin else 10

        # 取最近 N 条 user 消息（按 created_at 倒序）
        msg_q = (
            select(Message.content, Message.created_at)
            .join(Conversation, Conversation.id == Message.conversation_id)
            .where(and_(Message.role == "user", Message.created_at >= start))
            .order_by(Message.created_at.desc())
            .limit(5000)
        )
        if not self.is_admin:
            msg_q = msg_q.where(Conversation.user_id == self.current_user.id)

        result = await self.db.execute(msg_q)
        rows = result.all()

        # 词频统计
        word_counter: Counter = Counter()
        last_seen: dict[str, datetime.datetime] = {}
        for content, created_at in rows:
            words = _tokenize(content or "")
            for word in words:
                word_counter[word] += 1
                if word not in last_seen or created_at > last_seen[word]:
                    last_seen[word] = created_at

        # 取 Top
        top_words = word_counter.most_common(limit_n)
        return [
            TopQuestionItem(
                query=word,
                count=count,
                last_asked_at=last_seen.get(word),
            )
            for word, count in top_words
            if count >= 2  # 至少出现 2 次
        ]


def _tokenize(text: str) -> list[str]:
    """简单分词：中文字符 n-gram + 英文分词"""
    if not text:
        return []
    text = text.strip().lower()

    # 去除标点（保留字母数字和中文）
    text = re.sub(r"[^\w\s\u4e00-\u9fff]+", " ", text)

    tokens = []
    # 英文/数字单词
    en_words = re.findall(r"[a-z0-9]+", text)
    for w in en_words:
        if len(w) >= 2 and w not in STOP_WORDS:
            tokens.append(w)

    # 中文：2-4 字 n-gram
    cn_text = re.sub(r"[a-z0-9\s]+", " ", text)
    cn_chars = [c for c in cn_text if "\u4e00" <= c <= "\u9fff"]
    for n in (2, 3, 4):
        for i in range(len(cn_chars) - n + 1):
            gram = "".join(cn_chars[i : i + n])
            if gram not in STOP_WORDS:
                tokens.append(gram)

    return tokens


def _fill_missing_dates(items: list[DailyCount], days: int) -> list[DailyCount]:
    """补全缺失日期（保证趋势图连续）"""
    if not items:
        return items

    today = datetime.date.today()
    existing = {item.date: item.count for item in items}

    result = []
    for i in range(days - 1, -1, -1):
        d = (today - datetime.timedelta(days=i)).isoformat()
        result.append(DailyCount(date=d, count=existing.get(d, 0)))

    return result