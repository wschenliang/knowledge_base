"""端到端测试：高级搜索过滤 + facets + highlight。

需要本地 PostgreSQL（与 conftest.py 一致）+ 已运行 v6 迁移。
"""

from __future__ import annotations

import pytest

from app.models.acl import CollectionACL


async def _flush(db):
    """flush + commit 帮手。"""
    await db.flush()
    await db.commit()


@pytest.fixture
async def collection_with_docs(db, alice, bob):
    """构造：1 个 KB，2 个上传者（alice / bob），2 个文档。"""
    from app.models.document import Collection, Document

    c = Collection(
        name="kb-test",
        qdrant_collection="kb_kbtest",
        owner_id=alice.id,
    )
    db.add(c)
    await _flush(db)
    await db.refresh(c)

    # 给 alice / bob 授权 viewer
    for u in (alice, bob):
        db.add(CollectionACL(collection_id=c.id, user_id=u.id, role="viewer"))
    await _flush(db)

    d1 = Document(
        collection_id=c.id,
        filename="运维手册.pdf",
        file_path="x.pdf",
        file_type="pdf",
        chunk_count=1,
        status="indexed",
        uploader_id=alice.id,
    )
    d2 = Document(
        collection_id=c.id,
        filename="监控指南.md",
        file_path="y.md",
        file_type="md",
        chunk_count=1,
        status="indexed",
        uploader_id=bob.id,
    )
    db.add_all([d1, d2])
    await _flush(db)
    return c, d1, d2


@pytest.mark.asyncio
async def test_search_filters_schema_accepts_optional(client, alice_token):
    """filters 字段为 None 时不能 422。"""
    headers = {"Authorization": f"Bearer {alice_token}"}

    # 任意 collection_id 都能校验 schema（权限失败是另一回事）
    resp = await client.post(
        "/api/v1/search",
        headers=headers,
        json={"query": "x", "collection_id": "00000000-0000-0000-0000-000000000000"},
    )
    # 期望非 422（可能是 403/404/500，但 schema 通过）
    assert resp.status_code != 422, resp.text


@pytest.mark.asyncio
async def test_search_filters_with_payload_passes_schema(client, alice_token):
    """filters 完整字段时 schema 通过。"""
    headers = {"Authorization": f"Bearer {alice_token}"}

    resp = await client.post(
        "/api/v1/search",
        headers=headers,
        json={
            "query": "x",
            "collection_id": "00000000-0000-0000-0000-000000000000",
            "filters": {
                "file_types": ["pdf"],
                "uploader_ids": ["u1"],
                "tag_ids": ["t1"],
                "filename_contains": "运维",
            },
        },
    )
    assert resp.status_code != 422, resp.text


@pytest.mark.asyncio
async def test_facets_endpoint_returns_structure(
    client, collection_with_docs, alice_token
):
    """GET /search/facets 返回三类 FacetOption。"""
    headers = {"Authorization": f"Bearer {alice_token}"}

    c, _, _ = collection_with_docs
    resp = await client.get(
        f"/api/v1/search/facets?collection_id={c.id}",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert set(data.keys()) == {"uploaders", "tags", "file_types"}
    assert isinstance(data["uploaders"], list)
    assert isinstance(data["tags"], list)
    assert isinstance(data["file_types"], list)


@pytest.mark.asyncio
async def test_facets_count_uploader_documents(
    client, collection_with_docs, alice_token
):
    """uploaders 计数：alice 1 篇、bob 1 篇。"""
    headers = {"Authorization": f"Bearer {alice_token}"}

    c, _, _ = collection_with_docs
    resp = await client.get(
        f"/api/v1/search/facets?collection_id={c.id}",
        headers=headers,
    )
    data = resp.json()
    counts = {u["label"]: u["count"] for u in data["uploaders"]}
    assert counts.get("alice") == 1
    assert counts.get("bob") == 1