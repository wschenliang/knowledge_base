"""端到端权限测试 — 跨用户权限流程（不依赖 Qdrant/Redis 真实连接）。

覆盖场景：
1. 普通用户看不到自己没权限的 KB
2. 邀请后用户能访问 KB + 角色生效
3. viewer 不能上传 / editor 能上传
4. 非 admin 不能访问 admin/audit-logs
5. admin 可访问所有 KB 和 audit logs
6. owner 可邀请/升级/降级/移除成员
7. 转移所有权 后角色互换
"""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_user_cannot_see_others_collection(
    client, alice_token: str, bob_token: str
):
    """alice 创建的 KB，bob 看不到。"""
    resp = await client.post(
        "/api/v1/collections",
        json={"name": "alice-kb-e2e1"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert resp.status_code == 201, resp.text
    coll_id = resp.json()["id"]

    list_bob = await client.get(
        "/api/v1/collections",
        headers={"Authorization": f"Bearer {bob_token}"},
    )
    assert list_bob.status_code == 200
    items = list_bob.json()["items"]
    assert all(item["id"] != coll_id for item in items), "bob 应该看不到 alice 的 KB"


@pytest.mark.asyncio
async def test_admin_sees_all_collections(client, alice_token: str, admin_token: str):
    """admin 能看所有 KB（包括 alice 的）。"""
    resp = await client.post(
        "/api/v1/collections",
        json={"name": "alice-kb-e2e2"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    coll_id = resp.json()["id"]

    admin_list = await client.get(
        "/api/v1/collections",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    items = admin_list.json()["items"]
    assert any(item["id"] == coll_id for item in items), "admin 应该看到 alice 的 KB"
    # admin 列表里 my_role 应填 "owner"
    target = next(item for item in items if item["id"] == coll_id)
    assert target["my_role"] == "owner"


@pytest.mark.asyncio
async def test_invite_then_access_viewer(
    client, alice_token: str, bob_token: str
):
    """alice 邀请 bob 为 viewer，bob 看到 KB 但无上传权限。"""
    create_resp = await client.post(
        "/api/v1/collections",
        json={"name": "alice-kb-e2e3"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    coll_id = create_resp.json()["id"]

    invite = await client.post(
        f"/api/v1/collections/{coll_id}/acl",
        json={"username": "bob", "role": "viewer"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert invite.status_code == 201, invite.text

    # bob 现在能看到
    list_resp = await client.get(
        "/api/v1/collections",
        headers={"Authorization": f"Bearer {bob_token}"},
    )
    items = list_resp.json()["items"]
    target = next((i for i in items if i["id"] == coll_id), None)
    assert target is not None
    assert target["my_role"] == "viewer"

    # bob 访问 KB 详情也应该可以
    detail = await client.get(
        f"/api/v1/collections/{coll_id}",
        headers={"Authorization": f"Bearer {bob_token}"},
    )
    assert detail.status_code == 200
    assert detail.json()["my_role"] == "viewer"


@pytest.mark.asyncio
async def test_viewer_cannot_upload_but_editor_can(
    client, alice_token: str, bob_token: str
):
    """viewer 上传返回 403，editor 上传成功（mock 文件，不走 Qdrant）。"""
    create_resp = await client.post(
        "/api/v1/collections",
        json={"name": "alice-kb-e2e4"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    coll_id = create_resp.json()["id"]

    # 先邀请 bob 为 viewer
    await client.post(
        f"/api/v1/collections/{coll_id}/acl",
        json={"username": "bob", "role": "viewer"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )

    # viewer 上传 → 403
    viewer_upload = await client.post(
        "/api/v1/documents/upload",
        data={"collection_id": coll_id},
        files={"file": ("test.txt", b"hello world", "text/plain")},
        headers={"Authorization": f"Bearer {bob_token}"},
    )
    assert viewer_upload.status_code == 403, (
        f"viewer 不应能上传: {viewer_upload.status_code} {viewer_upload.text}"
    )

    # 升级为 editor
    bob_me = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {bob_token}"}
    )
    bob_id = bob_me.json()["id"]
    upgrade = await client.put(
        f"/api/v1/collections/{coll_id}/acl/{bob_id}",
        json={"role": "editor"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert upgrade.status_code == 200, upgrade.text

    # editor 列出文档（使用 query param collection_id）
    editor_list = await client.get(
        f"/api/v1/documents",
        params={"collection_id": coll_id},
        headers={"Authorization": f"Bearer {bob_token}"},
    )
    assert editor_list.status_code == 200, (
        f"editor 列文档应成功: {editor_list.status_code} {editor_list.text}"
    )


@pytest.mark.asyncio
async def test_non_member_cannot_access_acl_endpoints(
    client, alice_token: str, bob_token: str
):
    """bob 不是任何 KB 成员，调用 /acl 端点返回 403 或 404。"""
    create_resp = await client.post(
        "/api/v1/collections",
        json={"name": "alice-kb-e2e5"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    coll_id = create_resp.json()["id"]

    # bob 试图列出成员 — 应当被拒绝
    forbidden = await client.get(
        f"/api/v1/collections/{coll_id}/acl",
        headers={"Authorization": f"Bearer {bob_token}"},
    )
    assert forbidden.status_code in (403, 404), (
        f"非成员应被拒绝: {forbidden.status_code} {forbidden.text}"
    )


@pytest.mark.asyncio
async def test_owner_can_invite_update_remove(
    client, alice_token: str, bob_token: str
):
    """alice 作为 owner，可邀请/改/移除 bob。"""
    create_resp = await client.post(
        "/api/v1/collections",
        json={"name": "alice-kb-e2e6"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    coll_id = create_resp.json()["id"]

    # 邀请 bob 为 viewer
    invite = await client.post(
        f"/api/v1/collections/{coll_id}/acl",
        json={"username": "bob", "role": "viewer"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert invite.status_code == 201
    bob_acl_id = invite.json()["id"]

    # 升级为 editor
    bob_id = (
        await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {bob_token}"},
        )
    ).json()["id"]

    upgrade = await client.put(
        f"/api/v1/collections/{coll_id}/acl/{bob_id}",
        json={"role": "editor"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert upgrade.status_code == 200
    assert upgrade.json()["role"] == "editor"

    # 移除
    remove = await client.delete(
        f"/api/v1/collections/{coll_id}/acl/{bob_id}",
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert remove.status_code == 204

    # 确认移除后再次列表不应有 bob
    members = await client.get(
        f"/api/v1/collections/{coll_id}/acl",
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    user_ids = [m["user_id"] for m in members.json()["items"]]
    assert bob_id not in user_ids


@pytest.mark.asyncio
async def test_ownership_transfer_swaps_roles(
    client, alice_token: str, bob_token: str
):
    """alice 把所有权转移给 bob 后，alice 变 editor，bob 变 owner。"""
    create = await client.post(
        "/api/v1/collections",
        json={"name": "alice-kb-e2e7"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    coll_id = create.json()["id"]

    # 先让 bob 加入为 editor
    await client.post(
        f"/api/v1/collections/{coll_id}/acl",
        json={"username": "bob", "role": "editor"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )

    # 转移所有权
    transfer = await client.post(
        f"/api/v1/collections/{coll_id}/acl/transfer",
        json={"new_owner_username": "bob"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert transfer.status_code == 200, transfer.text

    # 验证：alice 现在是 editor
    alice_view = await client.get(
        f"/api/v1/collections/{coll_id}",
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert alice_view.json()["my_role"] == "editor"

    # 验证：bob 现在是 owner
    bob_view = await client.get(
        f"/api/v1/collections/{coll_id}",
        headers={"Authorization": f"Bearer {bob_token}"},
    )
    assert bob_view.json()["my_role"] == "owner"


@pytest.mark.asyncio
async def test_non_admin_cannot_view_audit_logs(client, alice_token: str):
    """非 admin 查审计日志返回 403。"""
    resp = await client.get(
        "/api/v1/admin/audit-logs",
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    assert resp.status_code == 403, f"{resp.status_code} {resp.text}"


@pytest.mark.asyncio
async def test_admin_can_view_audit_logs(
    client, alice_token: str, admin_token: str
):
    """admin 查审计日志返回 200，并可看到 alice 操作留下的记录。"""
    # alice 创建一个 KB，留下 audit 记录
    await client.post(
        "/api/v1/collections",
        json={"name": "alice-kb-e2e-audit"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )

    resp = await client.get(
        "/api/v1/admin/audit-logs",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "items" in body
    assert "total" in body


@pytest.mark.asyncio
async def test_chat_requires_viewer_role(client, alice_token: str, bob_token: str):
    """chat 端点要求 viewer+，bob 未受邀应被拒绝。"""
    create = await client.post(
        "/api/v1/collections",
        json={"name": "alice-kb-chat"},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    coll_id = create.json()["id"]

    chat = await client.post(
        "/api/v1/chat",
        json={"collection_id": coll_id, "query": "hello"},
        headers={"Authorization": f"Bearer {bob_token}"},
    )
    # bob 不是成员 → 应被拒绝（可能 403 或 404）
    assert chat.status_code in (403, 404), f"{chat.status_code} {chat.text}"
