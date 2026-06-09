# Python 异步编程实战指南

## 概述

Python 3.5 引入 `async/await` 语法后，异步编程在 Python 生态中得到了广泛应用。FastAPI、aiohttp、Tortoise-ORM 等框架都基于异步模型构建。异步编程的核心思想是在 I/O 密集型操作中，当程序等待外部资源（网络、磁盘、数据库）时，临时让出 CPU 控制权给其他任务执行，从而提高系统的整体吞吐量。

## 基础概念

### 协程（Coroutine）
协程是异步编程的基本执行单元，使用 `async def` 定义的函数即为协程函数。调用协程函数不会立即执行，而是返回一个协程对象。

### await 关键字
`await` 用于等待一个可等待对象的完成。可等待对象包括协程、Task 和 Future。

### 事件循环（Event Loop）
事件循环是异步程序的核心调度器，负责管理和调度所有协程的执行。

## 核心库对比

### asyncio（标准库）
Python 内置的异步 I/O 框架，提供了事件循环、协程调度、网络 I/O 等功能。

### anyio
跨平台异步库，同时支持 asyncio 和 trio 后端，提供了更安全的结构化并发模型。

### trio
基于结构化并发的异步框架，强调取消机制和错误处理的可预测性。

## async/await 最佳实践

### 1. 使用 asyncio.create_task 实现并发
```python
async def main():
    task1 = asyncio.create_task(fetch_data("url1"))
    task2 = asyncio.create_task(fetch_data("url2"))
    result1 = await task1
    result2 = await task2
```

### 2. 使用 asyncio.gather 并行执行
```python
results = await asyncio.gather(
    fetch_data("url1"),
    fetch_data("url2"),
    fetch_data("url3"),
    return_exceptions=True
)
```

### 3. 超时控制
```python
try:
    result = await asyncio.wait_for(
        long_operation(), timeout=30.0
    )
except asyncio.TimeoutError:
    print("操作超时")
```

### 4. 异步上下文管理器
```python
class AsyncSession:
    async def __aenter__(self):
        self.conn = await create_connection()
        return self.conn
    
    async def __aexit__(self, *args):
        await self.conn.close()
```

### 5. 异步迭代器
```python
class AsyncPaginator:
    def __aiter__(self):
        return self
    
    async def __anext__(self):
        data = await self.fetch_page()
        if not data:
            raise StopAsyncIteration
        return data
```

## SQLAlchemy 异步操作示例

本知识库系统采用了 SQLAlchemy 2.0 的异步模式：

```python
from sqlalchemy.ext.asyncio import (
    AsyncSession, async_sessionmaker, create_async_engine
)

# 创建异步引擎
engine = create_async_engine(
    "postgresql+asyncpg://user:pass@localhost/db",
    echo=True,
    pool_size=20,
    max_overflow=10
)

# 创建会话工厂
async_session = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

# 异步查询
async def get_user(db: AsyncSession, user_id: str):
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()

# 带事务提交的会话管理
async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

## FastAPI 异步依赖注入

FastAPI 原生支持异步依赖注入，这使得它可以很好地与异步 ORM 配合：

```python
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

app = FastAPI()

@app.get("/users/{user_id}")
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db)
):
    user = await db.execute(
        select(User).where(User.id == user_id)
    )
    return user.scalar_one_or_none()
```

## 常见陷阱与注意事项

### 同步代码阻塞事件循环
在异步函数中调用同步的 IO 操作（如 `requests.get`）会阻塞整个事件循环。应该始终使用异步库（如 `httpx.AsyncClient`）。

### 协程泄露
忘记 `await` 协程对象会导致协程没有被执行。编译器会发出 `RuntimeWarning: coroutine was never awaited` 警告。

### 共享可变状态
多协程共享可变对象时存在竞态条件，应使用 `asyncio.Lock` 进行同步。

### 调试模式
设置 `PYTHONASYNCIODEBUG=1` 环境变量可以启用 asyncio 调试模式，帮助检测协程泄露等潜在问题。

## 总结

异步编程为 Python 开发者提供了构建高并发 I/O 密集型应用的能力。通过合理使用 `async/await`、`asyncio.gather`、`asyncio.create_task` 等工具，结合成熟框架（FastAPI、SQLAlchemy 2.0），可以显著提升应用的性能和资源利用率。在本知识库系统中，异步编程使得文件上传、文档索引、RAG 查询等操作可以高效并发执行。
