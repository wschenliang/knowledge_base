## Docker 本地开发环境 - 服务配置信息

**安装日期：** 2026-07-02
**数据目录：** `C:\Users\cleve\docker-data\`
**Docker 网络：** `devtools`（所有服务共享）
**Docker 版本：** 29.4.3

---

### 1. MySQL 8.4

| 项目 | 值 |
|------|-----|
| 容器名 | `mysql` |
| 镜像 | `mysql:8.4` |
| Root 用户 | `root` |
| Root 密码 | `root123456` |
| 普通用户 | `dev` |
| 普通用户密码 | `dev123456` |
| 默认数据库 | `devdb` |
| 端口 | `3306` |
| 连接地址 | `localhost:3306` |
| JDBC URL | `jdbc:mysql://localhost:3306/devdb?useSSL=false&characterEncoding=utf8mb4&serverTimezone=Asia/Shanghai` |
| 数据目录 | `C:\Users\cleve\docker-data\mysql` |
| 重启策略 | `unless-stopped` |

**快速连接：**
```bash
docker exec -it mysql mysql -uroot -proot123456
```

---

### 2. Redis 7.4

| 项目 | 值 |
|------|-----|
| 容器名 | `redis` |
| 镜像 | `redis:7.4` |
| 密码 | `redis123456` |
| 端口 | `6379` |
| 连接地址 | `localhost:6379` |
| 持久化 | AOF (appendonly) 已开启 |
| 数据目录 | `C:\Users\cleve\docker-data\redis` |
| 重启策略 | `unless-stopped` |

**快速连接：**
```bash
docker exec -it redis redis-cli -a redis123456
```

**Spring Boot 配置示例：**
```yaml
spring:
  data:
    redis:
      host: localhost
      port: 6379
      password: redis123456
```

---

### 3. Prometheus (latest)

| 项目 | 值 |
|------|-----|
| 容器名 | `prometheus` |
| 镜像 | `prom/prometheus:latest` |
| 端口 | `9090` |
| Web UI | http://localhost:9090 |
| 配置文件 | `C:\Users\cleve\docker-data\prometheus\prometheus.yml` |
| 数据目录 | `C:\Users\cleve\docker-data\prometheus` |
| 认证 | 无（开发环境） |
| 重启策略 | `unless-stopped` |

**当前 scrape 配置：**
- `prometheus`：自身监控 (localhost:9090)
- `node-exporter`：主机监控 (host.docker.internal:9100，需额外安装 node-exporter)

---

### 4. Milvus v2.4.17（向量数据库）

| 项目 | 值 |
|------|-----|
| 容器名 | `milvus` |
| 镜像 | `milvusdb/milvus:v2.4.17` |
| gRPC 端口 | `19530` |
| Metrics 端口 | `9091` |
| 连接地址 | `localhost:19530` |
| API 地址 | http://localhost:19530/v1/vector/collections |
| 认证 | 无（默认 root/Milvus，未启用认证） |
| 元数据存储 | etcd (etcd:2379) |
| 对象存储 | MinIO (minio:9000, minioadmin/minioadmin) |
| 消息队列 | 内置 RocksMQ |
| 数据目录 | `C:\Users\cleve\docker-data\milvus\volumes\db` |
| 日志目录 | `C:\Users\cleve\docker-data\milvus\volumes\log` |
| 重启策略 | `unless-stopped` |

**依赖服务（需先启动）：**

| 容器名 | 镜像 | 端口 | 用途 |
|--------|------|------|------|
| `etcd` | `quay.io/coreos/etcd:v3.5.18` | `2379` | 元数据存储 |

---

### 5. MinIO (latest)

| 项目 | 值 |
|------|-----|
| 容器名 | `minio` |
| 镜像 | `minio/minio:latest` |
| S3 API 端口 | `9000` |
| Web 控制台端口 | `9001` |
| S3 API 地址 | http://localhost:9000 |
| Web 控制台 | http://localhost:9001 |
| 用户名 | `minioadmin` |
| 密码 | `minioadmin` |
| 数据目录 | `C:\Users\cleve\docker-data\minio` |
| 重启策略 | `unless-stopped` |

> 注意：Milvus 依赖 MinIO 进行对象存储，请勿修改 MinIO 的账号密码，否则需要同步更新 Milvus 配置。

---

### 6. RabbitMQ 3.13（含 Management 插件）

| 项目 | 值 |
|------|-----|
| 容器名 | `rabbitmq` |
| 镜像 | `rabbitmq:3.13-management` |
| AMQP 端口 | `5672` |
| Management UI 端口 | `15672` |
| AMQP 地址 | `amqp://admin:admin123456@localhost:5672` |
| Management UI | http://localhost:15672 |
| 用户名 | `admin` |
| 密码 | `admin123456` |
| 默认 Virtual Host | `/` |
| 数据目录 | `C:\Users\cleve\docker-data\rabbitmq` |
| 重启策略 | `unless-stopped` |

**Spring Boot 配置示例：**
```yaml
spring:
  rabbitmq:
    host: localhost
    port: 5672
    username: admin
    password: admin123456
    virtual-host: /
```

---

### 7. Elasticsearch 8.15.4

| 项目 | 值 |
|------|-----|
| 容器名 | `elasticsearch` |
| 镜像 | `docker.elastic.co/elasticsearch/elasticsearch:8.15.4` |
| HTTP 端口 | `9200` |
| 连接地址 | http://localhost:9200 |
| 集群名 | `docker-cluster` |
| 运行模式 | 单节点 (single-node) |
| 安全认证 | 已关闭 (xpack.security.enabled=false) |
| JVM 内存 | `-Xms512m -Xmx512m` |
| 数据目录 | `C:\Users\cleve\docker-data\elasticsearch` |
| 重启策略 | `unless-stopped` |

**验证命令：**
```bash
curl http://localhost:9200/_cluster/health?pretty
```

---

### 8. Kibana 8.15.4

| 项目 | 值 |
|------|-----|
| 容器名 | `kibana` |
| 镜像 | `docker.elastic.co/kibana/kibana:8.15.4` |
| 端口 | `5601` |
| Web UI | http://localhost:5601 |
| Elasticsearch 地址 | http://elasticsearch:9200（容器内网络） |
| 安全认证 | 已关闭 |
| 数据目录 | `C:\Users\cleve\docker-data\kibana` |
| 重启策略 | `unless-stopped` |

> 注意：Kibana 启动较慢（约 30-60 秒），首次访问可能需要等待。

---

### 9. Grafana (latest)

| 项目 | 值 |
|------|-----|
| 容器名 | `grafana` |
| 镜像 | `grafana/grafana:latest` |
| 端口 | `3000` |
| Web UI | http://localhost:3000 |
| 用户名 | `admin` |
| 密码 | `admin123456` |
| 数据目录 | `C:\Users\cleve\docker-data\grafana\data` |
| 数据源配置 | `C:\Users\cleve\docker-data\grafana\provisioning\datasources\prometheus.yml` |
| 重启策略 | `unless-stopped` |

**已预配置数据源：**

| 数据源名称 | 类型 | 地址 | 是否默认 |
|-----------|------|------|---------|
| Prometheus | prometheus | http://prometheus:9090（容器内网络） | 是 |

> Grafana 通过 provisioning 机制自动配置 Prometheus 数据源，启动后即可在 Dashboard 中使用，无需手动添加。

---

### 常用运维命令

**查看所有容器状态：**
```bash
docker ps --filter "network=devtools"
```

**启动全部服务：**
```bash
docker start etcd minio mysql redis prometheus grafana rabbitmq elasticsearch kibana milvus
```

**停止全部服务：**
```bash
docker stop milvus kibana elasticsearch rabbitmq grafana prometheus redis mysql minio etcd
```

> 建议启动顺序：先启动基础依赖（etcd、minio），再启动 Milvus，其他服务无依赖顺序要求。

**查看某个服务的日志：**
```bash
docker logs -f <容器名>    # 例如: docker logs -f mysql
```

**进入容器：**
```bash
docker exec -it <容器名> /bin/bash    # 例如: docker exec -it redis /bin/bash
```

---

### 端口总览

| 端口 | 服务 | 协议 | 访问地址 |
|------|------|------|----------|
| 3000 | Grafana | HTTP | http://localhost:3000 |
| 3306 | MySQL | TCP/JDBC | `localhost:3306` |
| 6379 | Redis | TCP | `localhost:6379` |
| 9090 | Prometheus | HTTP | http://localhost:9090 |
| 9091 | Milvus Metrics | HTTP | http://localhost:9091 |
| 19530 | Milvus | gRPC | `localhost:19530` |
| 9000 | MinIO S3 | HTTP | http://localhost:9000 |
| 9001 | MinIO Console | HTTP | http://localhost:9001 |
| 5672 | RabbitMQ AMQP | AMQP | `amqp://localhost:5672` |
| 15672 | RabbitMQ Management | HTTP | http://localhost:15672 |
| 9200 | Elasticsearch | HTTP | http://localhost:9200 |
| 5601 | Kibana | HTTP | http://localhost:5601 |
| 2379 | etcd | gRPC | `localhost:2379` |
