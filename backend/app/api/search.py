"""语义搜索 API"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_current_user
from app.auth.permissions import require_collection_role
from app.models.database import get_db
from app.models.document import User
from app.schemas.chat import SearchRequest, SearchResponse
from app.services.chat_service import ChatService

router = APIRouter(prefix="/api/v1/search", tags=["语义搜索"])
chat_service = ChatService()


@router.post("", response_model=SearchResponse)
async def search(
    req: Request,
    request: SearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """语义搜索知识库（需要 viewer+）"""
    # viewer 权限检查
    req.path_params["collection_id"] = request.collection_id
    await require_collection_role(
        req, min_role="viewer", db=db, current_user=current_user
    )

    try:
        result = await chat_service.search(
            query=request.query,
            collection_id=request.collection_id,
            top_k=request.top_k,
            use_reranker=request.use_reranker,
            db=db,
        )

        return SearchResponse(
            query=result["query"],
            results=result["results"],
            total=result["total"],
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"搜索失败: {str(e)}",
        )
