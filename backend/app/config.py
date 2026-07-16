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
    SMTP_HOST: str = "smtp.qq.com"
    SMTP_PORT: int = 465
    SMTP_USER: str = "chenliang006@qq.com"
    SMTP_PASSWORD: str = "xeiumagkmgctbfjf"
    SMTP_FROM: str = "CogniBase <chenliang006@qq.com>"
    SMTP_TLS: bool = True

    # 前端地址（用于邮件中的链接）
    FRONTEND_URL: str = "http://localhost:3000"

    # === OAuth 第三方登录 ===

    # Microsoft (Azure AD / 个人微软账号)
    MICROSOFT_CLIENT_ID: str = ""
    MICROSOFT_CLIENT_SECRET: str = ""
    # tenant: common=多租户（个人+企业），organizations=仅企业，consumers=仅个人，<tenant-id>=单租户
    MICROSOFT_TENANT: str = "common"
    MICROSOFT_AUTHORIZE_URL: str = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize"
    MICROSOFT_TOKEN_URL: str = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
    MICROSOFT_USERINFO_URL: str = "https://graph.microsoft.com/oidc/userinfo"

    # GitHub
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_AUTHORIZE_URL: str = "https://github.com/login/oauth/authorize"
    GITHUB_TOKEN_URL: str = "https://github.com/login/oauth/access_token"
    GITHUB_USER_URL: str = "https://api.github.com/user"
    GITHUB_EMAILS_URL: str = "https://api.github.com/user/emails"

    # 共同 OAuth 配置
    # 后端可访问的 OAuth 回调起始地址（用于拼接 redirect_uri）。
    # 开发环境为 http://localhost:8000；线上使用实际公网域名。
    OAUTH_BACKEND_BASE_URL: str = "http://localhost:8000"
    # 回调成功后跳回前端的 landing URL（带 token / status 参数）
    OAUTH_FRONTEND_CALLBACK: str = "http://localhost:3000/oauth-callback"
    # state 签名密钥：不填则默认回退到 SECRET_KEY
    OAUTH_STATE_SECRET: str = ""
    # state 有效期（秒）
    OAUTH_STATE_TTL: int = 600

    # OAuth 跳转 / 回调 / 绑定路径（用于拼接与同源校验）
    OAUTH_MICROSOFT_CALLBACK_PATH: str = "/api/v1/auth/oauth/microsoft/callback"
    OAUTH_GITHUB_CALLBACK_PATH: str = "/api/v1/auth/oauth/github/callback"


settings = Settings()
