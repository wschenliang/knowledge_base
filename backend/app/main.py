"""FastAPI 应用入口"""

from __future__ import annotations

import sys
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from loguru import logger

from prometheus_fastapi_instrumentator import Instrumentator

from app.config import settings

# Prometheus 指标收集器
instrumentator = Instrumentator()


def _setup_logging():
    """配置 loguru 日志：输出到控制台 + 滚动日志文件"""
    # 移除默认 handler
    logger.remove()

    # 控制台输出（彩色、详细）
    logger.add(
        sys.stderr,
        format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
               "<level>{level: <8}</level> | "
               "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> | "
               "<level>{message}</level>",
        level=settings.LOG_LEVEL,
        colorize=True,
    )

    # 确保日志目录存在
    log_dir = os.path.dirname(settings.LOG_FILE)
    if log_dir:
        os.makedirs(log_dir, exist_ok=True)

    # 文件输出（按大小轮转，保留 7 天）
    logger.add(
        settings.LOG_FILE,
        format="{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} | {message}",
        level=settings.LOG_LEVEL,
        rotation=settings.LOG_ROTATION,
        retention=settings.LOG_RETENTION,
        encoding="utf-8",
        enqueue=True,  # 多进程安全
    )

    # 拦截标准 logging 到 loguru（其他模块用 logging 也能被收集）
    import logging

    class InterceptHandler(logging.Handler):
        def emit(self, record: logging.LogRecord):
            # 将标准 logging 日志级别映射到 loguru
            level = logger.level(record.levelname).name
            frame, depth = logging.currentframe(), 2
            while frame.f_code.co_filename == logging.__file__:
                frame = frame.f_back
                depth += 1
            logger.opt(depth=depth, exception=record.exc_info).log(
                level, record.getMessage()
            )

    logging.basicConfig(handlers=[InterceptHandler()], level=0, force=True)

    # 设置 Uvicorn 日志也走 loguru
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error", "fastapi"):
        logging.getLogger(name).handlers = [InterceptHandler()]

    logger.info(f"日志系统初始化完成: 控制台 + {settings.LOG_FILE}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时 — 先初始化日志
    _setup_logging()

    logger.info(f"启动 {settings.APP_NAME}")
    logger.info(f"Debug 模式: {settings.DEBUG}")
    logger.info(f"数据库: {settings.DATABASE_URL.split('@')[-1] if '@' in settings.DATABASE_URL else settings.DATABASE_URL}")

    # 尝试创建数据库表
    try:
        from app.models.init_db import create_tables

        await create_tables()
        logger.info("数据库表初始化完成")
    except Exception as e:
        logger.warning(f"数据库表初始化失败 (可能在 docker 中首次启动): {e}")

    # v2 ACL 迁移：为现有 KB 自动创建 owner ACL（幂等）
    try:
        from app.models.database import async_session
        from app.scripts.migrate_v2_acl import migrate_v2_acl

        async with async_session() as db:
            result = await migrate_v2_acl(db)
            logger.info(
                f"v2 ACL 迁移完成: migrated={result['migrated']}, orphans={result['orphans']}"
            )
    except Exception as e:
        logger.warning(f"v2 ACL 迁移失败: {e}")

    # 初始化 Prometheus 指标
    logger.info("Prometheus 指标已启用: /metrics")

    yield

    # 关闭时
    logger.info(f"关闭 {settings.APP_NAME}")


app = FastAPI(
    title=settings.APP_NAME,
    description="企业知识库智能问答系统 API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ===== 全局异常处理 =====

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理器 — 记录完整的错误信息到日志"""
    import traceback

    # 获取请求体（尝试）
    body = None
    try:
        body = await request.body()
        body = body.decode("utf-8")[:2000]  # 截断过长内容
    except Exception:
        body = "<无法读取请求体>"

    logger.opt(exception=True).error(
        f"未处理异常 | {request.method} {request.url.path} | "
        f"客户端: {request.client.host if request.client else 'unknown'} | "
        f"请求体: {body}"
    )

    return JSONResponse(
        status_code=500,
        content={
            "detail": f"服务器内部错误: {str(exc)}",
            "error_type": type(exc).__name__,
        },
    )


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: Exception):
    """500 错误专用处理器"""
    return await global_exception_handler(request, exc)


# ===== 注册路由 =====

@app.get("/")
async def root():
    """根路径 - 健康检查"""
    return {
        "service": settings.APP_NAME,
        "version": "1.0.0",
        "status": "running",
    }


@app.get("/health")
async def health_check():
    """健康检查接口"""
    return {"status": "healthy"}


# 注册各个 API 模块
from app.api.collections import router as collections_router
from app.api.documents import router as documents_router
from app.api.chat import router as chat_router
from app.api.search import router as search_router
from app.api.acl import router as acl_router
from app.api.admin import router as admin_router
from app.api.dashboard import router as dashboard_router
from app.auth.jwt import router as auth_router

app.include_router(auth_router)
app.include_router(collections_router)
app.include_router(documents_router)
app.include_router(chat_router)
app.include_router(search_router)
app.include_router(acl_router)
app.include_router(admin_router)
app.include_router(dashboard_router)

# 初始化 Prometheus 指标
instrumentator.instrument(app).expose(app, endpoint="/metrics")
