"""问答对话 API"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_current_user
from app.models.database import get_db
from app.models.document import User
from app.schemas.chat import ChatRequest, ChatResponse
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
