"""文档管理 API"""

from __future__ import annotations

import logging
import os
import traceback

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import get_current_user
from app.models.database import get_db
from app.models.document import User
from app.schemas.document import DocumentList, DocumentResponse
from app.services.document_service import DocumentService
from app.services.chat_service import get_rag_engine
from app.utils.file_utils import is_supported, get_file_type, SUPPORTED_EXTENSIONS, SUPPORTED_EXTENSIONS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/documents", tags=["文档管理"])
document_service = DocumentService()


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    collection_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """上传文档到知识库"""
    # 检查文件格式
    if not is_supported(file.filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件格式: {file.filename}。支持格式: {', '.join(SUPPORTED_EXTENSIONS.keys())}",
        )

    # 读取文件内容
    file_content = await file.read()
    if not file_content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文件内容为空",
        )

    # 上传到 MinIO 并创建记录
    document = await document_service.upload_document(
        collection_id=collection_id,
        filename=file.filename,
        file_content=file_content,
        file_type=get_file_type(file.filename),
        db=db,
    )

    # 异步索引到 RAG 引擎 (简化版: 直接同步索引)
    try:
        from app.config import settings
        from app.models.document import Collection
        from sqlalchemy import select

        # 获取 collection 信息
        result = await db.execute(
            select(Collection).where(Collection.id == collection_id)
        )
        collection = result.scalar_one_or_none()

        if collection:
            # 保存到临时文件并索引
            import tempfile
            ext = os.path.splitext(file.filename)[1]
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
                tmp.write(file_content)
                tmp_path = tmp.name

            try:
                rag_engine = get_rag_engine()
                chunk_count = await rag_engine.index_document(
                    file_path=tmp_path,
                    collection_name=collection.qdrant_collection,
                    metadata={
                        "filename": file.filename,
                        "file_type": get_file_type(file.filename),
                        "collection_id": collection_id,
                        "document_id": document.id,
                    },
                )

                # 更新文档状态
                document.status = "indexed"
                document.chunk_count = chunk_count
                await db.flush()

                logger.info(
                    f"文档索引完成: {file.filename}, {chunk_count} 个块"
                )
            finally:
                os.unlink(tmp_path)

    except Exception as e:
        logger.error(f"文档索引失败: {file.filename}, 错误: {e}")
        logger.error(traceback.format_exc())
        document.status = "failed"
        document.error_message = str(e)
        await db.flush()

    await db.refresh(document)
    return DocumentResponse.model_validate(document)


@router.get("", response_model=DocumentList)
async def list_documents(
    collection_id: str = None,
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """列出文档"""
    documents, total = await document_service.list_documents(
        db=db, collection_id=collection_id, skip=skip, limit=limit
    )
    return DocumentList(
        items=[DocumentResponse.model_validate(d) for d in documents],
        total=total,
    )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取文档详情"""
    document = await document_service.get_document(document_id, db)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文档不存在",
        )
    return DocumentResponse.model_validate(document)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除文档"""
    # 获取文档信息以获取 collection
    from sqlalchemy import select
    from app.models.document import Document, Collection

    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文档不存在",
        )

    # 获取 collection 的 qdrant_collection 名称
    result = await db.execute(
        select(Collection).where(Collection.id == document.collection_id)
    )
    collection = result.scalar_one_or_none()

    # 从 Qdrant 删除
    if collection:
        try:
            rag_engine = get_rag_engine()
            await rag_engine.delete_document(
                collection_name=collection.qdrant_collection,
                file_path=document.file_path,
            )
        except Exception as e:
            logger.error(f"从 Qdrant 删除文档失败: {e}")

    # 从数据库删除
    await document_service.delete_document(document_id, db)
