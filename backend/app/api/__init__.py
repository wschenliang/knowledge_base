"""API 路由"""

from app.api.documents import router as documents_router
from app.api.collections import router as collections_router
from app.api.chat import router as chat_router
from app.api.search import router as search_router

__all__ = ["documents_router", "collections_router", "chat_router", "search_router"]
