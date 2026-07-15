"""问答对话 API"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_current_user
from app.models.database import get_db
from app.models.document import User
from app.schemas.chat import (
    ChatRequest,
    ChatResponse,
    ConversationResponse,
    ConversationDetail,
    ConversationList,
    MessageResponse,
    RenameConversationRequest,
)
from app.services.chat_service import ChatService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/chat", tags=["知识问答"])
chat_service = ChatService()


@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """基于知识库进行问答"""
    try:
        result = await chat_service.chat(
            query=request.query,
            collection_id=request.collection_id,
            conversation_id=request.conversation_id,
            user_id=current_user.id,
            top_k=request.top_k,
            use_reranker=request.use_reranker,
            db=db,
        )

        return ChatResponse(
            answer=result["answer"],
            sources=result.get("sources", []),
            conversation_id=result["conversation_id"],
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.exception(f"问答失败: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"问答处理失败: {str(e)}",
        )


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """基于知识库进行流式问答（SSE）"""

    async def event_generator():
        try:
            async for event in chat_service.chat_stream(
                query=request.query,
                collection_id=request.collection_id,
                conversation_id=request.conversation_id,
                user_id=current_user.id,
                top_k=request.top_k,
                use_reranker=request.use_reranker,
                db=db,
            ):
                yield event
        except ValueError as e:
            import json
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"
        except Exception as e:
            import json
            logger.exception(f"流式问答失败: {e}")
            yield f"data: {json.dumps({'type': 'error', 'content': f'服务器内部错误: {str(e)}'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ===== 对话历史 =====


@router.get("/conversations", response_model=ConversationList)
async def list_conversations(
    collection_id: str | None = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取对话列表"""
    conversations, total = await chat_service.list_conversations(
        user_id=current_user.id,
        collection_id=collection_id,
        skip=skip,
        limit=limit,
        db=db,
    )
    return ConversationList(
        items=[ConversationResponse.model_validate(c) for c in conversations],
        total=total,
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取对话详情（含消息列表）"""
    conv = await chat_service.get_conversation(conversation_id, current_user.id, db)
    if not conv:
        raise HTTPException(status_code=404, detail="对话不存在")

    messages = await chat_service.get_conversation_messages(conversation_id, db)

    result = ConversationDetail(
        id=conv.id,
        collection_id=conv.collection_id,
        title=conv.title,
        message_count=conv.message_count,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=[MessageResponse.model_validate(m) for m in messages],
    )
    return result


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除对话"""
    deleted = await chat_service.delete_conversation(
        conversation_id, current_user.id, db
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="对话不存在")


@router.put("/conversations/{conversation_id}", response_model=ConversationResponse)
async def rename_conversation(
    conversation_id: str,
    request: RenameConversationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """重命名对话"""
    conv = await chat_service.rename_conversation(
        conversation_id, current_user.id, request.title, db
    )
    if not conv:
        raise HTTPException(status_code=404, detail="对话不存在")
    return ConversationResponse.model_validate(conv)
