# Docker 容器化部署实践

## 为什么选择容器化

容器化技术解决了软件开发中的经典难题："在我的机器上能跑！"。Docker 通过将应用及其依赖打包到标准化的容器镜像中，确保应用在任何环境中都能以相同的方式运行。

## Docker 核心概念

### 镜像（Image）
镜像是一个轻量级、可执行的独立软件包，包含运行应用所需的所有内容：代码、运行时环境、系统工具、库和配置。

### 容器（Container）
容器是镜像的运行实例。一个镜像可以创建多个容器实例，每个容器彼此隔离。

### Dockerfile
Dockerfile 是一个文本文件，包含构建镜像所需的指令。每一行指令都会创建一个新的镜像层。

### Docker Compose
Docker Compose 通过 YAML 文件定义和运行多容器应用，适用于开发环境和简单生产部署。

## 多阶段构建

多阶段构建可以显著减小最终镜像的体积：

```dockerfile
# 构建阶段
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --user -r requirements.txt

# 运行阶段
FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0"]
```

## Docker Compose 编排

本知识库项目采用 Docker Compose 进行服务编排，包含以下核心服务：

### 基础设施服务
- Qdrant：向量数据库，用于存储文档的向量索引
- PostgreSQL：关系数据库，存储用户、文档元数据和对话记录
- Redis：缓存和消息队列，支撑 Celery 任务分发
- MinIO：对象存储，保存原始文档文件

### 应用服务
- Backend：FastAPI 应用，提供 RESTful API
- Celery Worker：异步文档处理任务

### 网络配置
所有服务通过自定义网络 `kb-network` 互联，后端服务使用容器名作为主机名访问数据库服务。

```yaml
services:
  backend:
    environment:
      - DATABASE_URL=postgresql+asyncpg://kbuser:kbpass@postgres:5432/knowledge_base
      - QDRANT_URL=http://qdrant:6333
    networks:
      - kb-network
    depends_on:
      - postgres
      - qdrant
      - redis
```

## 生产环境部署要点

### 1. 反向代理
使用 Nginx 作为反向代理，统一入口：
- `/api/` 路由到后端服务
- `/` 路由到前端页面
- 支持 WebSocket 代理

### 2. 资源限制
为每个容器设置 CPU 和内存限制，防止服务间资源争抢：

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

### 3. 健康检查
配置健康检查端点，确保容器异常时自动重启：

```yaml
services:
  backend:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      retries: 3
```

### 4. 日志管理
- 使用 JSON 格式日志便于日志聚合
- 配置日志轮转，避免磁盘占满
- 使用 loguru 或 structlog 进行结构化日志

### 5. 数据持久化
所有有状态服务使用 Docker Volume 进行数据持久化：

```yaml
volumes:
  qdrant_data:
  postgres_data:
  redis_data:
  minio_data:
```

## 性能优化建议

1. **镜像瘦身**：使用 Alpine 或 slim 基础镜像
2. **层缓存优化**：将频繁变更的指令放在 Dockerfile 末尾
3. **多阶段构建**：分离构建环境和运行环境
4. **配置管理**：使用环境变量或 ConfigMap 管理配置
5. **日志驱动**：使用 json-file 或 journald 日志驱动，避免容器日志丢失

## 常见问题

### 1. 容器启动顺序
使用 `depends_on` 只能保证容器启动顺序，不能保证服务就绪。需要使用健康检查或 wait-for-it 脚本确保依赖就绪。

### 2. 性能监控
集成 Prometheus 和 Grafana，监控容器 CPU、内存、网络和磁盘指标。

### 3. 备份策略
- PostgreSQL：使用 pg_dump 定期导出 SQL
- Qdrant：备份 storage 目录
- MinIO：使用 mc 客户端同步到远端

## 总结

容器化是现代应用部署的基石。通过 Docker Compose 编排基础设施服务和应用服务，开发者可以在本地复现生产环境，运维人员可以快速部署和扩展系统。本知识库项目从开发到生产提供了完整的容器化方案，确保环境一致性和部署效率。
