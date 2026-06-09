# 企业知识库智能问答系统 (AI Knowledge Base)

> 基于 RAG（检索增强生成）架构的智能知识库管理系统，支持文档管理、语义搜索和 AI 智能问答。

## 📖 项目简介

企业知识库智能问答系统是一套完整的企业级知识管理解决方案，采用前后端分离架构，整合了多种先进技术栈。系统支持多种格式文档的导入与管理（PDF、Word、PPT、Excel、Markdown 等），通过向量化存储和**混合检索引擎**（向量语义检索 + BM25 关键词检索 + RRF 融合算法）实现高效的语义搜索，并基于大语言模型（OpenAI / Ollama）提供智能问答能力。

### 核心特性

- 📚 **知识库管理**：创建、管理多个知识库集合，支持自定义分块策略和嵌入模型
- 📄 **多格式文档解析**：支持 PDF、DOCX、PPTX、XLSX、TXT、Markdown、HTML、CSV 共 9 种格式
- 🔍 **混合检索**：向量语义检索 + BM25 关键词检索 + RRF（倒数排名融合）算法，互补提升检索精度
- 🎯 **智能重排序**：三级降级策略（Jina Reranker API → Cross-encoder → 原序截断）
- 💬 **多轮 AI 问答**：基于 RAG 架构，支持上下文对话历史的多轮问答，自动管理对话记录
- 🔐 **用户认证与授权**：JWT 令牌认证，bcrypt 密码哈希，user/admin 角色权限控制
- 📊 **可观测性**：Prometheus 指标采集 + Grafana 可视化监控面板
- 🐳 **容器化部署**：完整 Docker Compose 编排，开发/生产环境独立配置，Nginx 反向代理
- 🌐 **双 AI 模式**：支持 OpenAI 云端模式（GPT-4o-mini + text-embedding-3-small）和 Ollama 本地模式（Qwen2.5 + BGE-M3），可无缝切换
- ⚡ **异步文档处理**：Celery + Redis 异步任务队列，大文档不阻塞 API 响应

## 🛠 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端** | Next.js 16 + React 19 + TypeScript | 服务端渲染，App Router 架构 |
| **UI 框架** | Tailwind CSS 4 | 原子化 CSS 样式 |
| **后端** | Python 3.12 + FastAPI | 异步 Web 框架 |
| **ORM** | SQLAlchemy 2.0 (async) | 异步数据库操作 |
| **向量数据库** | Qdrant v1.13 | 高性能向量存储与检索 |
| **关系数据库** | PostgreSQL 16 | 元数据、用户、对话历史存储 |
| **缓存/消息队列** | Redis 7 | Celery 任务队列 + 缓存 |
| **对象存储** | MinIO | 文档原始文件存储 |
| **RAG 框架** | LlamaIndex 0.12+ | 文档索引、检索与合成 |
| **AI 模型** | OpenAI API / Ollama | 嵌入模型 + 大语言模型 |
| **任务队列** | Celery 5.4 | 异步文档处理 |
| **反向代理** | Nginx | 生产环境流量路由 |
| **监控** | Prometheus + Grafana | 指标采集与可视化 |
| **容器化** | Docker Compose | 服务编排 |

## 🚀 快速开始

### 环境要求

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| **Docker** + **Docker Compose** | 最新版 | 用于启动基础设施服务（Qdrant、PostgreSQL、Redis、MinIO） |
| **Node.js** | 22+ | 前端开发运行环境 |
| **Python** | 3.12+ | 后端开发运行环境 |
| **OpenAI API Key** | — | 云端模式必需（推荐），也可使用本地 Ollama |

### 环境变量配置

在项目根目录创建 `.env` 文件（可选，开发环境有默认值）：

```bash
# ===== AI 模型配置 =====
# OpenAI API（使用云端模型时必填，设置后自动启用云端模式）
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxx

# Jina AI API（可选，增强重排序效果，不设置则自动降级到 Cross-encoder）
JINA_API_KEY=jina_xxxxxxxxxxxxxxxxxx

# ===== 安全配置 =====
# 应用密钥（生产环境必须更换为随机值）
SECRET_KEY=$(openssl rand -hex 32)

# ===== 本地模型配置（未设置 OPENAI_API_KEY 时生效）=====
# OLLAMA_BASE_URL=http://localhost:11434
# EMBEDDING_MODEL=bge-m3
# LLM_MODEL=qwen2.5:7b
```

### 一键启动（开发环境）

```bash
# 1. 克隆项目
git clone <repository-url>
cd 知识库

# 2. 启动所有后端基础设施服务（Docker）
docker-compose -p kb up -d

# 3. 安装前端依赖并启动
cd frontend
npm install
npm run dev
```

> **提示：** 如果不想使用 Docker，也可以手动安装 PostgreSQL、Qdrant、Redis 和 MinIO，然后使用下方「本地开发」方式启动。

启动后访问：

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端界面 | [http://localhost:3000](http://localhost:3000) | Next.js 开发服务器 |
| 后端 API | [http://localhost:8000](http://localhost:8000) | FastAPI 服务 |
| API 文档 (Swagger) | [http://localhost:8000/docs](http://localhost:8000/docs) | 自动生成的交互式 API 文档 |
| API 文档 (ReDoc) | [http://localhost:8000/redoc](http://localhost:8000/redoc) | 备选 API 文档格式 |
| MinIO 控制台 | [http://localhost:9001](http://localhost:9001) | 对象存储管理界面 |
| 健康检查 | [http://localhost:8000/health](http://localhost:8000/health) | 服务健康状态 |

### 本地开发（不使用 Docker）

```bash
# ===== 后端 =====
cd backend

# 创建虚拟环境（推荐）
python -m venv .venv
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 使用 SQLite 本地开发（无需 PostgreSQL）
export DATABASE_URL=sqlite+aiosqlite:///./data/knowledge_base.db

# 使用 Qdrant 本地模式（无需 Docker）
export QDRANT_LOCAL_PATH=./data/qdrant

# 启动后端
uvicorn app.main:app --reload --port 8000

# ===== 前端（新终端）=====
cd frontend
npm install
npm run dev
```

## 📁 项目结构

```
知识库/
├── backend/                     # 后端 Python 服务
│   ├── app/
│   │   ├── api/                 # API 路由层
│   │   │   ├── collections.py   #   知识库集合 CRUD
│   │   │   ├── documents.py     #   文档上传/管理
│   │   │   ├── chat.py          #   问答对话
│   │   │   └── search.py        #   语义搜索
│   │   ├── auth/                # 认证授权
│   │   │   ├── __init__.py      #   密码哈希/JWT 生成
│   │   │   ├── jwt.py           #   JWT 验证/注册/登录 API
│   │   │   └── permissions.py   #   权限控制
│   │   ├── models/              # 数据模型 (SQLAlchemy ORM)
│   │   │   ├── document.py      #   Document/Collection/User/Conversation/Message
│   │   │   ├── database.py      #   异步数据库连接
│   │   │   └── init_db.py       #   表初始化
│   │   ├── schemas/             # Pydantic 请求/响应模型
│   │   ├── services/            # 业务逻辑层
│   │   │   ├── chat_service.py  #   问答服务
│   │   │   └── document_service.py # 文档管理服务
│   │   ├── rag/                 # RAG 引擎核心
│   │   │   ├── engine.py        #   核心编排
│   │   │   ├── reader.py        #   文档读取
│   │   │   ├── chunker.py       #   文本分块
│   │   │   ├── embedder.py      #   向量嵌入
│   │   │   ├── retriever.py     #   混合检索 (向量+BM25+RRF)
│   │   │   ├── reranker.py      #   重排序
│   │   │   ├── synthesizer.py   #   答案合成
│   │   │   └── prompt_templates.py # 提示词模板
│   │   ├── tasks/               # 异步任务
│   │   │   ├── celery_app.py    #   Celery 配置
│   │   │   └── document_processing.py # 文档索引任务
│   │   ├── utils/               # 工具函数
│   │   └── config.py            # 应用配置
│   ├── requirements.txt         # Python 依赖
│   └── Dockerfile               # Docker 镜像
├── frontend/                    # 前端 Next.js 应用
│   └── src/
│       ├── app/                 # App Router 页面
│       │   ├── page.tsx         #   登录首页
│       │   ├── dashboard/       #   知识库管理
│       │   ├── collections/[id] #   文档详情
│       │   ├── chat/            #   问答对话
│       │   └── search/          #   语义搜索
│       ├── components/          # 可复用组件
│       │   ├── Layout.tsx       #   侧边栏布局
│       │   ├── LoginForm.tsx    #   登录/注册表单
│       │   ├── CollectionCard.tsx # 知识库卡片
│       │   ├── DocumentList.tsx #   文档列表
│       │   ├── ChatBox.tsx      #   聊天组件
│       │   ├── SearchBox.tsx    #   搜索组件
│       │   └── SourceCard.tsx   #   引用来源卡片
│       ├── lib/                 # 工具库
│       │   ├── api.ts           #   API 客户端封装
│       │   └── auth-context.tsx #   认证上下文
│       └── types/               # TypeScript 类型定义
├── nginx/                       # Nginx 反向代理配置
├── monitoring/                  # 监控配置
│   ├── prometheus/              #   Prometheus 采集
│   └── grafana/                 #   Grafana 仪表盘
├── docker-compose.yml           # 开发环境编排
├── docker-compose.prod.yml      # 生产环境编排
└── README.md
```

## 📡 API 接口说明

所有 API 采用 RESTful 风格，基础路径为 `/api/v1`。完整的接口文档可启动服务后访问 [http://localhost:8000/docs](http://localhost:8000/docs) 查看交互式 Swagger 文档。

### 认证模块 (`/api/v1/auth`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/v1/auth/register` | 用户注册 | ❌ |
| POST | `/api/v1/auth/login` | 用户登录，返回 JWT Token | ❌ |
| GET | `/api/v1/auth/me` | 获取当前用户信息 | ✅ |

**快速使用示例：**

```bash
# 注册新用户
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123","email":"admin@example.com"}'

# 登录获取 Token
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### 知识库集合 (`/api/v1/collections`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/v1/collections` | 创建知识库集合 | ✅ |
| GET | `/api/v1/collections` | 列出知识库集合（支持分页） | ✅ |
| GET | `/api/v1/collections/{id}` | 获取集合详情 | ✅ |

**快速使用示例：**

```bash
# 创建知识库（替换 YOUR_TOKEN）
curl -X POST http://localhost:8000/api/v1/collections \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"技术文档","description":"公司技术文档知识库"}'

# 列出所有知识库
curl http://localhost:8000/api/v1/collections \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 文档管理 (`/api/v1/documents`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/v1/documents/upload` | 上传文档（multipart/form-data） | ✅ |
| GET | `/api/v1/documents` | 列出文档（支持按集合过滤和分页） | ✅ |
| GET | `/api/v1/documents/{id}` | 获取文档详情 | ✅ |
| DELETE | `/api/v1/documents/{id}` | 删除文档（同时清理向量数据） | ✅ |

**支持上传格式：** PDF (.pdf) / Word (.docx) / PowerPoint (.pptx) / Excel (.xlsx) / 纯文本 (.txt) / Markdown (.md) / HTML (.html) / CSV (.csv)

**快速使用示例：**

```bash
# 上传文档到指定知识库
curl -X POST http://localhost:8000/api/v1/documents/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "collection_id=YOUR_COLLECTION_ID" \
  -F "file=@/path/to/document.pdf"
```

### 问答对话 (`/api/v1/chat`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/v1/chat` | 基于知识库进行智能问答 | ✅ |

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `query` | string | ✅ | 用户问题 |
| `collection_id` | string | ✅ | 知识库 ID |
| `conversation_id` | string | ❌ | 对话 ID（传入则继续多轮对话） |
| `top_k` | int | ❌ | 返回引用数（默认 5） |
| `use_reranker` | bool | ❌ | 是否使用重排序（默认 true） |

**快速使用示例：**

```bash
# 单轮问答
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"什么是微服务架构？","collection_id":"YOUR_COLLECTION_ID"}'
```

### 语义搜索 (`/api/v1/search`)

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/v1/search` | 语义搜索（仅检索，不生成答案） | ✅ |

**快速使用示例：**

```bash
# 语义搜索
curl -X POST http://localhost:8000/api/v1/search \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"部署流程","collection_id":"YOUR_COLLECTION_ID"}'
```

### 系统接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/` | 服务信息（名称、版本、运行状态） | ❌ |
| GET | `/health` | 健康检查 | ❌ |
| GET | `/metrics` | Prometheus 指标采集端点 | ❌ |

### 典型使用流程

```bash
# 1. 注册并登录
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"demo123"}' | jq -r '.access_token')

# 2. 创建知识库
COLLECTION_ID=$(curl -s -X POST http://localhost:8000/api/v1/collections \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"我的知识库"}' | jq -r '.id')

# 3. 上传文档
curl -X POST http://localhost:8000/api/v1/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "collection_id=$COLLECTION_ID" \
  -F "file=@document.pdf"

# 4. 开始问答
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"总结文档内容\",\"collection_id\":\"$COLLECTION_ID\"}"
```

## 🚢 部署指南

### 生产环境部署

```bash
# 1. 配置生产环境变量
cat > .env << EOF
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxx
JINA_API_KEY=jina_xxxxxxxxxxxxxxxxxx
SECRET_KEY=$(openssl rand -hex 32)
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 16)
EOF

# 2. 构建并启动所有服务
docker-compose -f docker-compose.prod.yml up -d --build

# 3. 查看日志
docker-compose -f docker-compose.prod.yml logs -f

# 4. 停止服务
docker-compose -f docker-compose.prod.yml down
```

### 生产环境架构说明

生产环境通过 `docker-compose.prod.yml` 自动配置以下增强功能：

| 功能 | 说明 |
|------|------|
| **Nginx 反向代理** | 统一入口（端口 80），路由 `/api/` → 后端，`/` → 前端 |
| **Gunicorn + Uvicorn** | 多 worker 模式，提升后端并发处理能力 |
| **Prometheus 监控** | 自动采集 Backend、Qdrant、PostgreSQL、Redis 指标 |
| **Grafana 仪表盘** | 预配置知识库监控面板 |
| **资源限制** | 各容器 CPU/内存限制，防止资源争抢 |
| **健康检查** | 所有服务配置健康检查，自动重启异常容器 |
| **数据持久化** | 所有数据通过 Docker volumes 持久化 |

### 访问地址

| 服务 | 开发环境 | 生产环境 |
|------|----------|----------|
| 前端 | `http://localhost:3000` | `http://localhost` (Nginx) |
| 后端 API | `http://localhost:8000` | `http://localhost/api` |
| API 文档 | `http://localhost:8000/docs` | `http://localhost/api/docs` |
| MinIO 控制台 | `http://localhost:9001` | `http://localhost:9001` |
| Prometheus | — | `http://localhost:9090` |
| Grafana | — | `http://localhost:3001` |

### 安全清单（生产部署前必查）

- [ ] 将 `.env` 中所有默认密码更换为强密码
- [ ] 生成随机 `SECRET_KEY`（`openssl rand -hex 32`）
- [ ] 配置 HTTPS（Nginx SSL 终止 + Let's Encrypt 证书）
- [ ] 限制 CORS `allow_origins` 为实际前端域名
- [ ] 配置数据库和 MinIO 的定期备份策略
- [ ] 关闭 `DEBUG` 模式和详细错误日志输出
- [ ] 为 Grafana 设置强密码并限制公网访问

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 开发流程

1. **Fork** 本项目
2. 创建功能分支：`git checkout -b feature/amazing-feature`
3. 提交代码：`git commit -m 'feat: add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 提交 Pull Request

### 开发规范

| 类别 | 规范 |
|------|------|
| **Python 代码** | 遵循 PEP 8，使用 `ruff` 或 `black` 格式化 |
| **TypeScript** | 严格模式，ESLint 检查（`@eslint-config-next`） |
| **提交信息** | [Conventional Commits](https://www.conventionalcommits.org/)（`feat:` / `fix:` / `docs:` 等） |
| **API 设计** | RESTful 风格，路径使用 `/api/v1/{resource}` |
| **命名约定** | 后端用 `snake_case`，前端用 `camelCase` |
| **新增功能** | 必须包含相应的 API 文档注释（FastAPI docstring） |

### 项目结构约定

```
backend/app/
├── api/          # API 路由，直接处理 HTTP 请求/响应
├── services/     # 业务逻辑层，协调多个模块
├── rag/          # RAG 引擎，不依赖 FastAPI
├── models/       # SQLAlchemy ORM 模型
├── schemas/      # Pydantic 请求/响应模型
├── auth/         # 认证授权
├── tasks/        # Celery 异步任务
└── utils/        # 通用工具函数
```

## 📚 文档

- [项目详细设计文档](docs/项目详细设计文档.md) — 包含系统架构、数据库设计、API 设计、安全设计等
- [API 交互式文档](http://localhost:8000/docs) — 启动服务后访问 Swagger UI

## 📄 许可证

本项目仅供内部使用和企业学习参考。

---

<p align="center">
  <sub>Built with ❤️ using FastAPI + Next.js + Qdrant + LlamaIndex</sub>
</p>
