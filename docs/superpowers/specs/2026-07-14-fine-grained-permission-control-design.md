# 细粒度权限控制 — 设计文档

**日期**: 2026-07-14
**作者**: Brainstorming 会话
**状态**: Approved
**版本**: v1

---

## 1. 背景与目标

### 当前问题

企业知识库当前的权限模型过于简单：

| 现状 | 问题 |
|------|------|
| `User.role` 仅 `admin` / `user` 二元 | 无法区分不同 KB 的不同权限 |
| `Collection.owner_id` 仅记录创建者 | **未参与任何权限校验**，纯展示信息 |
| `Collection.is_public` 字段定义但**完全未使用** | 死代码 |
| `GET /collections` 返回**全部**知识库 | 任何用户可看到全公司的 KB 列表 |
| `POST /documents/upload` / `DELETE /documents/{id}` | 任何登录用户可对任何 KB 增删文档 |
| `GET /collections/{id}` | 任何登录用户可读取任意 KB 详情 |
| `POST /chat` / `/chat/stream` / `/search` | 任何登录用户可对任意 KB 提问 |

**结论**：当前系统**没有真正的访问控制**，是 P0 级安全风险。

### 目标

为知识库引入**Owner / Editor / Viewer 三级权限模型**：

- 支持定向邀请（按用户名）
- Admin 拥有超级权限
- 完整的审计日志
- 实时权限校验
- 现有数据自动迁移

---

## 2. 范围与限制

| 维度 | 决策 |
|------|------|
| 权限颗粒度 | ✅ 知识库级（**不做**文档级或对话级） |
| 分享机制 | ✅ 仅定向邀请（**不做**公开链接） |
| Admin 能力 | ✅ 超级权限（可绕过 ACL 操作任何 KB） |
| 被邀请者识别 | ✅ 按用户名 |
| Owner 离开 | ✅ Admin 接管 |
| 审计日志 | ✅ 必需 |
| 权限计算 | ✅ 实时计算（无 JWT 缓存） |
| 现有数据迁移 | ✅ 基于 `owner_id` 自动生成 owner ACL |

---

## 3. 数据模型

### 3.1 新增 `collection_acls` 表

```sql
CREATE TABLE collection_acls (
    id              VARCHAR(36)  PRIMARY KEY,           -- UUID
    collection_id   VARCHAR(36)  NOT NULL,             -- FK → collections.id, ON DELETE CASCADE
    user_id         VARCHAR(36)  NOT NULL,             -- FK → users.id, ON DELETE CASCADE
    role            VARCHAR(20)  NOT NULL,             -- 'owner' | 'editor' | 'viewer'
    granted_by      VARCHAR(36),                       -- FK → users.id, ON DELETE SET NULL
    created_at      TIMESTAMP    DEFAULT now(),
    updated_at      TIMESTAMP    DEFAULT now(),

    CONSTRAINT uq_collection_user UNIQUE (collection_id, user_id)
);

CREATE INDEX idx_acl_user        ON collection_acls(user_id);
CREATE INDEX idx_acl_collection  ON collection_acls(collection_id);
```

### 3.2 新增 `audit_logs` 表

```sql
CREATE TABLE audit_logs (
    id            BIGSERIAL    PRIMARY KEY,
    user_id       VARCHAR(36),                        -- FK → users.id, ON DELETE SET NULL
    action        VARCHAR(50)  NOT NULL,              -- 'acl.grant' | 'acl.revoke' | 'acl.update' | 'acl.transfer' | 'coll.delete' | 'doc.delete'
    resource_type VARCHAR(20)  NOT NULL,              -- 'collection' | 'document'
    resource_id   VARCHAR(36)  NOT NULL,
    detail        JSONB,                              -- {"target_user":"alice", "old_role":"viewer", "new_role":"editor"}
    ip_address    VARCHAR(45),
    user_agent    VARCHAR(500),
    created_at    TIMESTAMP    DEFAULT now()
);

CREATE INDEX idx_audit_user_time   ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_resource    ON audit_logs(resource_type, resource_id, created_at DESC);
```

### 3.3 修改 `collections` 表

- **保留** `owner_id` 字段（迁移用，后续可作为冗余字段展示；真正的权限查 ACL 表）
- **`is_public` 字段**：保留在数据库表中（项目使用 SQLAlchemy `create_all`，不处理 `DROP COLUMN`），但**从 SQLAlchemy 模型中移除并停止使用**。后续可写一次性脚本 `ALTER TABLE collections DROP COLUMN is_public` 清理。这是已弃用字段。

### 3.4 `users` 表不变

`role` 字段语义扩展：`admin` 现有权限（管理用户） + 新增"可绕过 ACL 操作任何 KB"。

---

## 4. 角色定义

| 角色 | 能力 |
|------|------|
| `owner` | 全部权限 + 管理 ACL + 删除 KB + 转移所有权 |
| `editor` | 读 / 写（上传、删除文档）/ 问答 / 搜索 |
| `viewer` | 读 / 问答 / 搜索（只读） |
| `admin` | **绕过所有 ACL**，可操作任何 KB；同时具备平台级用户管理权限 |

角色优先级（数字大 = 权限高）：`owner (3) > editor (2) > viewer (1) > 无权限 (0)`

---

## 5. 权限矩阵（端点 → 所需角色）

| 端点 | 所需权限 | 说明 |
|------|---------|------|
| `GET /collections` | 任意登录 | **改为只返回当前用户可访问的 KB**；admin 看全部 |
| `POST /collections` | 任意登录 | 创建者自动获得 owner ACL |
| `GET /collections/{id}` | viewer+ | |
| `PATCH /collections/{id}` | owner | 修改名称 / 描述 |
| `DELETE /collections/{id}` | owner | 删除 KB |
| `GET /collections/{id}/acl` | owner | 查看成员列表 |
| `POST /collections/{id}/acl` | owner | 邀请新成员 |
| `PUT /collections/{id}/acl/{user_id}` | owner | 修改成员角色 |
| `DELETE /collections/{id}/acl/{user_id}` | owner | 移除成员 |
| `POST /collections/{id}/transfer` | owner | 转移所有权 |
| `POST /documents/upload` | editor+ | 上传文档 |
| `GET /documents` | viewer+ | 列出文档 |
| `GET /documents/{id}` | viewer+ | 文档详情 |
| `DELETE /documents/{id}` | editor+ | 删除文档 |
| `POST /chat` / `/chat/stream` | viewer+ | 问答 |
| `GET /search` | viewer+ | 语义搜索 |
| `GET /admin/audit-logs` | admin | 审计日志查询 |

---

## 6. 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     FastAPI 路由层                            │
│  collections.py / documents.py / chat.py / search.py         │
│  注入: Depends(get_current_user) + Depends(require_role(...))│
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────┐
│                 权限中间件层 (新增)                            │
│  app/auth/permissions.py                                     │
│   • require_collection_role(collection_id, min_role) 依赖     │
│   • PermissionService.resolve(user_id, collection_id)         │
│   • PermissionService.audit(...)                              │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────┐
│                    数据访问层                                │
│   CollectionACL (新) │ AuditLog (新) │ User/Collection       │
└─────────────────────────────────────────────────────────────┘
```

### 6.1 关键依赖

```python
# app/auth/permissions.py 新增
ROLE_PRIORITY = {"owner": 3, "editor": 2, "viewer": 1}

async def require_collection_role(
    collection_id: str,                     # 路径参数自动注入
    min_role: str,                          # 'viewer' | 'editor' | 'owner'
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> tuple[User, Collection]:
    """检查用户对指定 KB 的权限。
    
    返回 (current_user, collection)。权限不足时抛 403。
    Admin 自动放行。
    """
```

### 6.2 服务层

```python
# app/services/permission_service.py 新增
class PermissionService:
    async def get_role(user_id, collection_id, db) -> Optional[str]
    async def grant(collection_id, user_id, role, granted_by, db) -> ACL
    async def revoke(collection_id, user_id, db) -> bool
    async def update_role(collection_id, user_id, new_role, db) -> ACL
    async def transfer_ownership(collection_id, new_owner_id, current_owner_id, db) -> None
    async def list_members(collection_id, db) -> list[dict]
    async def accessible_collections(user_id, db, include_admin=True) -> list[Collection]
```

---

## 7. API 契约

### 7.1 邀请新成员

```http
POST /api/v1/collections/{collection_id}/acl
Authorization: Bearer <token>
Content-Type: application/json

{
  "username": "alice",          // 按用户名查找
  "role": "editor"              // 'editor' | 'viewer'（不能直接 owner）
}

→ 201 Created
{
  "id": "uuid",
  "collection_id": "uuid",
  "user_id": "uuid",
  "username": "alice",
  "role": "editor",
  "granted_by": "uuid",
  "created_at": "2026-07-14T10:00:00Z"
}

→ 404 {"detail": "用户不存在"}
→ 403 {"detail": "需要 owner 权限"}
→ 409 {"detail": "该用户已是成员"}
```

### 7.2 修改成员角色

```http
PUT /api/v1/collections/{collection_id}/acl/{user_id}
{
  "role": "viewer"
}

→ 200 { ... ACL 对象 ... }
→ 400 {"detail": "不能修改 owner 角色，请使用所有权转移接口"}
```

### 7.3 所有权转移

```http
POST /api/v1/collections/{collection_id}/transfer
{
  "new_owner_username": "bob"
}

→ 200 { "old_owner_id": "...", "new_owner_id": "..." }
→ 400 {"detail": "目标用户不是知识库成员"}
→ 400 {"detail": "不能将所有权转移给自己"}
```

### 7.4 移除成员

```http
DELETE /api/v1/collections/{collection_id}/acl/{user_id}
→ 204 No Content
→ 400 {"detail": "不能移除 owner，请先转移所有权"}
```

### 7.5 查看成员列表

```http
GET /api/v1/collections/{collection_id}/acl
→ 200 {
  "items": [
    {
      "id": "...",
      "user_id": "...",
      "username": "alice",
      "display_name": "Alice Wang",
      "role": "owner",
      "granted_by": "...",
      "created_at": "..."
    }
  ],
  "total": 3
}
```

### 7.6 审计日志（admin only）

```http
GET /api/v1/admin/audit-logs?user_id=&action=&skip=0&limit=50
→ 200 {
  "items": [
    {
      "id": 1,
      "user_id": "...",
      "username": "alice",
      "action": "acl.grant",
      "resource_type": "collection",
      "resource_id": "...",
      "detail": { "target_user": "bob", "role": "editor" },
      "ip_address": "127.0.0.1",
      "created_at": "..."
    }
  ],
  "total": 100
}
```

---

## 8. 前端设计

### 8.1 CollectionCard（dashboard）

```
┌─────────────────────────────────┐
│ ▔▔▔▔▔▔▔▔▔ 渐变色条带 ▔▔▔▔▔▔▔▔▔▔│
│ 知识库名              [Owner 👑]│ ← 新增角色徽章
│ 描述...                →       │
│ ────────────────────────────  │
│ 📄 5 个文档  📅 2026-01-01    │
└─────────────────────────────────┘
```

角色徽章颜色：
- `Owner` — 紫色 + 皇冠
- `Editor` — 蓝色 + 笔
- `Viewer` — 灰色 + 眼睛

### 8.2 集合详情页 — 新增"成员" Tab

```
[概览] [成员 (3)]
─────────────────────────
概览：原知识库信息 + 文档管理
─────────────────────────
成员 Tab：
┌─────────────────────────────────┐
│ 成员管理                         │
│ ┌─────────────────────────────┐ │
│ │ 👤 Alice Wang  Owner       │ │
│ │ 👤 Bob Liu     Editor  ⋮   │ │
│ │ 👤 Carol Sun   Viewer  ⋮   │ │
│ └─────────────────────────────┘ │
│ [+ 邀请成员]                    │
└─────────────────────────────────┘
```

### 8.3 权限可见性

- Viewer 看到文档列表时，"上传"按钮禁用并 tooltip"无写入权限"
- Editor 没有成员管理 Tab（UI 隐藏）
- 删除 KB 按钮仅 owner 可见
- Owner 在删除对话框中需输入知识库名称确认

### 8.4 新增前端文件

```
src/
├── components/
│   ├── CollectionMemberManager.tsx   ← 新（成员管理 Tab）
│   ├── InviteMemberDialog.tsx        ← 新（邀请对话框）
│   └── RoleBadge.tsx                 ← 新（角色徽章）
├── lib/
│   ├── api.ts                        ← 修改（新增 6 个 ACL 方法）
│   └── permissions.ts                ← 新（前端角色工具函数）
└── types/
    └── index.ts                      ← 修改（添加类型）
```

---

## 9. 数据迁移

### 9.1 启动时自动迁移

放在 `app/models/init_db.py` 的应用启动钩子中，**幂等执行**：

```python
async def migrate_v2_acl(db: AsyncSession):
    """v2 迁移：为现有 KB 自动创建 owner ACL"""
    # 1. 用 INSERT ... ON CONFLICT DO NOTHING 写入 owner ACL
    # 2. 删除 collections.is_public 列（IF EXISTS）
    # 3. SQLAlchemy create_all 自动处理新表
```

**幂等保证**：使用 `INSERT ... ON CONFLICT DO NOTHING`，重复执行无副作用。

### 9.2 迁移场景

| 现有状态 | 迁移后 |
|---------|--------|
| KB 有 owner_id | 自动创建 `(owner_id, role=owner)` ACL |
| KB 无 owner_id（孤儿） | 仅 admin 可访问，无 owner ACL |
| KB 有 owner_id 但 owner 已被删除 | ACL 同步被 CASCADE 删除，KB 变孤儿 |
| 用户登录后可看见的 KB | 仅返回有 ACL 关联的 KB + admin 看全部 |

---

## 10. 测试策略

### 10.1 后端单元测试

| 测试文件 | 覆盖范围 |
|---------|---------|
| `test_acl_service.py` | 邀请 / 移除 / 转移 / 升降级操作 |
| `test_permissions_dep.py` | `require_collection_role` 各角色组合 |
| `test_migration.py` | 现有 KB 自动生成 ACL |
| `test_audit_log.py` | 审计日志记录完整性 |

### 10.2 后端集成测试

| 场景 | 期望 |
|------|------|
| Viewer 尝试上传文档 | 403 |
| Editor 尝试修改 KB 名称 | 403 |
| Owner 删除 KB | 200，级联删除文档 |
| A 创建 KB → B 不可见 | `GET /collections` 不含此 KB |
| A 邀请 B 为 editor → B 上传文档 | 200 |
| A 转移所有权给 B → A 变 editor | B 是 owner，A 是 editor |
| 非 admin 访问审计日志 | 403 |
| Admin 可操作任何 KB | 通过 |

### 10.3 前端组件测试

| 组件 | 场景 |
|------|------|
| CollectionCard | 角色徽章正确显示 / hover 显示权限说明 |
| CollectionMemberManager | 邀请 → 列表更新 / 升级 → 角色变化 / 移除 → 消失 |
| RoleBadge | 三种角色视觉一致 |

---

## 11. 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| 迁移脚本执行失败 | 幂等 + 失败不阻塞启动；提供 CLI `python -m app.scripts.migrate_v2_acl` 手动重跑 |
| 每请求多一次 ACL 查询性能下降 | `idx_user` / `idx_collection` 索引覆盖；后续可加 Redis 缓存 |
| Admin 误操作无法撤销 | 完整审计日志；可查询所有 admin 操作历史 |
| Owner 账号被删除 KB 不可用 | FK ON DELETE CASCADE；admin 接管逻辑兜底 |
| 唯一 owner 转移给自己 | API 校验 + 数据库约束 |

---

## 12. 实施顺序

按依赖关系，**严格按以下顺序**实施：

1. **数据模型**：`collection_acls` / `audit_logs` 表 + SQLAlchemy 模型
2. **迁移脚本**：启动时自动跑迁移
3. **服务层**：`PermissionService` + `require_collection_role` 依赖
4. **API 端点**：6 个新 ACL 管理端点
5. **改造现有端点**：12 个端点加权限检查
6. **后端测试**：单元 + 集成
7. **前端类型与 API**：types/index.ts + lib/api.ts
8. **前端组件**：RoleBadge → CollectionMemberManager → InviteMemberDialog
9. **前端集成**：CollectionCard 徽章 + 详情页 Tab + 权限可见性
10. **端到端测试**：跨用户完整流程

---

## 13. 成功标准

- ✅ 任何登录用户无法看到自己无权访问的 KB（`GET /collections` 过滤生效）
- ✅ 普通用户尝试操作他人 KB 时返回 403
- ✅ Admin 可访问所有 KB 和审计日志
- ✅ 现有数据无丢失（迁移后所有 KB 都至少 owner 可访问）
- ✅ 所有权限变更产生审计记录
- ✅ 端到端流程测试通过：邀请 → 协作 → 转移 → 移除

---

## 附录 A：完整新增文件清单

**后端**
- `app/models/acl.py`（新增）
- `app/services/permission_service.py`（新增）
- `app/api/acl.py`（新增）
- `app/api/admin.py`（新增，仅 admin 端点）
- `app/models/init_db.py`（修改：加入迁移逻辑）
- `app/auth/permissions.py`（修改：新增 `require_collection_role`）
- `app/api/collections.py`（修改：所有端点加权限检查）
- `app/api/documents.py`（修改：所有端点加权限检查）
- `app/api/chat.py`（修改：chat/stream 加 viewer+ 检查）
- `app/api/search.py`（修改：搜索加 viewer+ 检查）
- `app/schemas/acl.py`（新增：ACL 请求/响应模型）
- `app/models/document.py`（修改：从 ORM 模型移除 `is_public`，数据库列保留）

**前端**
- `src/components/RoleBadge.tsx`（新增）
- `src/components/CollectionMemberManager.tsx`（新增）
- `src/components/InviteMemberDialog.tsx`（新增）
- `src/lib/permissions.ts`（新增）
- `src/lib/api.ts`（修改：6 个 ACL 方法）
- `src/types/index.ts`（修改：添加类型）
- `src/components/CollectionCard.tsx`（修改：加徽章）
- `src/app/collections/[id]/page.tsx`（修改：加 Tab）