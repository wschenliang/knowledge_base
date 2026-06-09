"""文档处理异步任务"""

from __future__ import annotations

import logging
import os
import tempfile

from app.tasks.celery_app import celery_app
from app.rag.engine import RAGEngine
from app.config import settings

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3)
def index_document_task(
    self,
    file_content: bytes,
    filename: str,
    collection_name: str,
    metadata: dict = None,
):
    """异步索引文档到知识库"""
    metadata = metadata or {}
    ext = os.path.splitext(filename)[1]

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(file_content)
        tmp_path = tmp.name

    try:
        import asyncio

        engine = RAGEngine()
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            chunk_count = loop.run_until_complete(
                engine.index_document(
                    file_path=tmp_path,
                    collection_name=collection_name,
                    metadata=metadata,
                )
            )
            return {"chunk_count": chunk_count, "status": "success"}
        finally:
            loop.close()
    except Exception as exc:
        logger.error(f"文档索引任务失败: {filename}, 错误: {exc}")
        raise self.retry(exc=exc, countdown=60)
    finally:
        os.unlink(tmp_path)
