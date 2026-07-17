"""语义搜索 API"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_current_user
from app.auth.permissions import require_collection_role
from app.models.database import get_db
from app.models.document import User
from app.schemas.chat import SearchRequest, SearchResponse, SearchFacetsResponse
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

    # 把 Pydantic model 转成 dict（向后兼容：None 字段也保留）
    filters = (
        request.filters.model_dump(exclude_none=True)
        if request.filters is not None
        else None
    )

    try:
        result = await chat_service.search(
            query=request.query,
            collection_id=request.collection_id,
            top_k=request.top_k,
            use_reranker=request.use_reranker,
            filters=filters,
            db=db,
        )

        return SearchResponse(
            query=result["query"],
            results=result["results"],
            total=result["total"],
            applied_filters=request.filters,
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


@router.get("/facets", response_model=SearchFacetsResponse)
async def search_facets(
    req: Request,
    collection_id: str = Query(..., description="知识库 UUID"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取知识库的可选筛选维度（需要 viewer+）

    一次 SQL 联查，按 collection_id 范围返回：
    - uploaders: 当前 KB 中所有上传者（id / username / 文档数）
    - tags: 当前 KB 关联的所有标签
    - file_types: 当前 KB 中出现过的文件类型
    """
    # viewer 权限检查
    req.path_params["collection_id"] = collection_id
    await require_collection_role(
        req, min_role="viewer", db=db, current_user=current_user
    )

    try:
        result = await chat_service.get_search_facets(collection_id, db)
        return SearchFacetsResponse(
            uploaders=result["uploaders"],
            tags=result["tags"],
            file_types=result["file_types"],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取 facets 失败: {str(e)}")