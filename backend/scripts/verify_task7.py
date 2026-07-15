"""Task 7 API 验证脚本：documents 端点权限（viewer/editor 区分）"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

SAMPLES_DIR = Path(__file__).resolve().parents[2] / "samples"


def http_call(method, url, token=None, body=None, files=None, form_data=None):
    """通用 HTTP 调用：files=multipart，body=json，form_data=dict（表单字段）"""
    headers = {}
    if token:
        headers['Authorization'] = f'Bearer {token}'

    if files or form_data:
        boundary = '----formdata-pytest' + os.urandom(8).hex()
        parts: list[bytes] = []
        if form_data:
            for k, v in form_data.items():
                parts.append(
                    f'--{boundary}\r\n'
                    f'Content-Disposition: form-data; name="{k}"\r\n\r\n'
                    f'{v}\r\n'.encode('utf-8')
                )
        if files:
            for k, (filename, content, content_type) in files.items():
                parts.append(
                    f'--{boundary}\r\n'
                    f'Content-Disposition: form-data; name="{k}"; filename="{filename}"\r\n'
                    f'Content-Type: {content_type}\r\n\r\n'.encode('utf-8')
                    + content + b'\r\n'
                )
        body_bytes = b''.join(parts) + f'--{boundary}--\r\n'.encode('utf-8')
        headers['Content-Type'] = f'multipart/form-data; boundary={boundary}'
        data = body_bytes
    elif body is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(body).encode('utf-8')
    else:
        data = None

    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else None
        except Exception:
            return e.code, raw.decode('utf-8', errors='replace')


def login(username, password):
    code, data = http_call('POST', 'http://localhost:8004/api/v1/auth/login',
                            body={'username': username, 'password': password})
    assert code == 200, f'login {username}: {code} {data}'
    return data['access_token']


def assert_eq(actual, expected, label):
    if actual != expected:
        raise AssertionError(f'{label}: expected={expected!r}, got={actual!r}')
    print(f'  [OK] {label} = {actual!r}')


def find_sample_file():
    """找一个现成 sample 文件用于上传"""
    for name in ('Python异步编程.md', '微服务架构设计.md', 'Docker容器化部署实践.md', 'RAG技术入门与实践.txt'):
        p = SAMPLES_DIR / name
        if p.exists():
            return p
    raise FileNotFoundError(f'no sample file in {SAMPLES_DIR}')


def main():
    admin_token = login('admin_test', 'test123')
    target_token = login('viewer_test', 'test123')

    # ===== Setup: 创建独立 KB 用于本次测试 =====
    kb_name = f'doc-perm-test-{int(time.time())}'
    code, new_coll = http_call('POST', 'http://localhost:8004/api/v1/collections',
                                token=admin_token,
                                body={'name': kb_name, 'description': '文档权限测试'})
    assert code == 201, f'create KB: {code} {new_coll}'
    coll_id = new_coll['id']
    print(f'\n[setup] KB: {kb_name} ({coll_id[:8]})')

    sample_path = find_sample_file()
    file_bytes = sample_path.read_bytes()
    filename = sample_path.name
    file_ct = 'text/markdown' if filename.endswith('.md') else 'text/plain'
    print(f'[setup] sample: {filename} ({len(file_bytes)} bytes)')

    # 拿 viewer_test 的 user_id
    code, me = http_call('GET', 'http://localhost:8004/api/v1/auth/me', token=target_token)
    target_user_id = me['id']

    # ===== 测试 1: admin 上传（admin 短路有权限） =====
    print('\n[1] POST /documents/upload admin 上传')
    code, doc1 = http_call(
        'POST', 'http://localhost:8004/api/v1/documents/upload',
        token=admin_token,
        form_data={'collection_id': coll_id},
        files={'file': (filename, file_bytes, file_ct)},
    )
    assert_eq(code, 201, 'status')
    admin_doc_id = doc1['id']
    print(f'  -> document_id={admin_doc_id[:8]}')

    # ===== 测试 2: viewer 无权限上传应 403 =====
    print('\n[2] viewer 上传到该 KB 应 403（无 editor 权限）')
    code, err = http_call(
        'POST', 'http://localhost:8004/api/v1/documents/upload',
        token=target_token,
        form_data={'collection_id': coll_id},
        files={'file': (filename, file_bytes, file_ct)},
    )
    assert_eq(code, 403, 'status')

    # ===== 测试 3: admin 邀请 viewer 为 editor =====
    print('\n[3] admin POST /acl 让 viewer_test 升级为 editor')
    code, _ = http_call('POST', f'http://localhost:8004/api/v1/collections/{coll_id}/acl',
                         token=admin_token,
                         body={'username': 'viewer_test', 'role': 'editor'})
    assert_eq(code, 201, 'invite status')

    # ===== 测试 4: viewer 现在是 editor 可以上传 =====
    print('\n[4] viewer 以 editor 身份上传（应 201）')
    code, doc2 = http_call(
        'POST', 'http://localhost:8004/api/v1/documents/upload',
        token=target_token,
        form_data={'collection_id': coll_id},
        files={'file': (filename, file_bytes, file_ct)},
    )
    assert_eq(code, 201, 'status')
    editor_doc_id = doc2['id']

    # ===== 测试 5: GET /documents?collection_id=... 列表（viewer 已是 editor） =====
    print('\n[5] GET /documents?collection_id viewer 列表该 KB')
    code, docs = http_call('GET',
                            f'http://localhost:8004/api/v1/documents?collection_id={coll_id}',
                            token=target_token)
    assert_eq(code, 200, 'status')
    assert_eq(docs['total'], 2, 'total docs in this KB')

    # ===== 测试 6: 列表跨 KB：无 collection_id 时应只返回自己有 ACL 的 KB 下的文档 =====
    print('\n[6] GET /documents（无 filter）：admin 看全部，viewer 仅看自己有 ACL 的 KB')
    code, docs_admin = http_call('GET', 'http://localhost:8004/api/v1/documents',
                                  token=admin_token)
    assert code == 200
    print(f'  admin total = {docs_admin["total"]}')
    code, docs_v = http_call('GET', 'http://localhost:8004/api/v1/documents',
                             token=target_token)
    assert_eq(code, 200, 'status')
    print(f'  viewer (editor of this KB) total = {docs_v["total"]}')

    # ===== 测试 7: 降级 viewer 为 viewer，删除应 403 =====
    print('\n[7] PUT /acl 降级 viewer 为 viewer 后 DELETE 文档应 403')
    code, _ = http_call('PUT',
                         f'http://localhost:8004/api/v1/collections/{coll_id}/acl/{target_user_id}',
                         token=admin_token, body={'role': 'viewer'})
    assert_eq(code, 200, 'downgrade status')

    code, _ = http_call('DELETE',
                         f'http://localhost:8004/api/v1/documents/{editor_doc_id}',
                         token=target_token)
    assert_eq(code, 403, 'viewer delete should be 403')

    # ===== 测试 8: viewer 直接列表该 KB (collection_id) 应仍能（viewer+ 可列出） =====
    print('\n[8] viewer（仅 viewer）列表该 KB 仍可看（viewer+ 允许）')
    code, docs = http_call('GET',
                            f'http://localhost:8004/api/v1/documents?collection_id={coll_id}',
                            token=target_token)
    assert_eq(code, 200, 'status')

    # ===== 测试 9: 不属于任何 KB 的用户，列具体 collection_id 应 403 =====
    print('\n[9] 创建一个不属于该 KB 的用户，列具体 collection 应 403')
    # 用 admin 创建一个新 KB 和新用户测试，或者用 viewer_test 让他离开（本次 viewer_test 已有 viewer 角色）
    # 跳过：用 viewer_test 列另一个 KB 应该 403
    other_kb_name = f'other-kb-{int(time.time())}'
    code, other_kb = http_call('POST', 'http://localhost:8004/api/v1/collections',
                                token=admin_token,
                                body={'name': other_kb_name})
    assert code == 201
    code, _ = http_call('GET',
                         f'http://localhost:8004/api/v1/documents?collection_id={other_kb["id"]}',
                         token=target_token)
    assert_eq(code, 403, 'viewer list other KB should be 403')

    # ===== 测试 10: admin 删除文档（成功） =====
    print('\n[10] admin DELETE 文档应 204')
    code, _ = http_call('DELETE',
                         f'http://localhost:8004/api/v1/documents/{admin_doc_id}',
                         token=admin_token)
    assert_eq(code, 204, 'status')

    print('\n所有 Task 7 API 验证通过!')


if __name__ == '__main__':
    main()
