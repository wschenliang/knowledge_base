"""应用配置管理"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # 应用
    APP_NAME: str = "Enterprise Knowledge Base"
    DEBUG: bool = True
    LOG_LEVEL: str = "DEBUG"
    LOG_FILE: str = "logs/app.log"  # 日志文件路径
    LOG_ROTATION: str = "10 MB"     # 日志轮转大小
    LOG_RETENTION: str = "7 days"   # 日志保留时间
    SECRET_KEY: str = "dev-secret-key-change-in-production"

    # 数据库 (支持 PostgreSQL 和 SQLite)
    # SQLite: sqlite+aiosqlite:///./data/knowledge_base.db
    DATABASE_URL: str = "postgresql+asyncpg://kbuser:kbpass@localhost:5432/knowledge_base"

    # 向量数据库
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_GRPC_PORT: int = 6334
    QDRANT_LOCAL_PATH: str = ""  # 设置为非空路径以启用本地模式（无需 Docker）

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # MinIO 对象存储
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "knowledge-base"
    MINIO_USE_SSL: bool = False

    # Ollama 本地模型
    OLLAMA_BASE_URL: str = "http://ollama:11434"
    EMBEDDING_MODEL: str = "bge-m3"
    LLM_MODEL: str = "qwen2.5:0.5b"
    LLM_REQUEST_TIMEOUT: float = 300.0

    # OpenAI (可选)
    OPENAI_API_KEY: str | None = None
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    OPENAI_LLM_MODEL: str = "gpt-4o-mini"

    # 分块策略
    CHUNK_SIZE: int = 512
    CHUNK_OVERLAP: int = 128

    # 检索参数
    TOP_K_VECTOR: int = 30
    TOP_K_BM25: int = 20
    RERANK_TOP_K: int = 5

    # Qdrant collection 配置
    QDRANT_COLLECTION_PREFIX: str = "kb_"
    EMBEDDING_DIM: int = 1024  # bge-m3 为 1024 维; nomic-embed-text 为 768 维; text-embedding-3-small 为 1536 维

    # 邮件配置
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_TLS: bool = True

    # 前端地址（用于邮件中的链接）
    FRONTEND_URL: str = "http://localhost:3000"


settings = Settings()
