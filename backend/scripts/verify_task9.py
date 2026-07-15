"""Task 9 API 验证脚本：admin 审计日志端点"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request


def call(method, url, token=None, body=None):
    headers = {}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    if body is not None:
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


def login(u, p):
    c, d = call('POST', 'http://localhost:8004/api/v1/auth/login',
                body={'username': u, 'password': p})
    assert c == 200, f'login {u}: {c} {d}'
    return d['access_token']


def assert_eq(a, e, l):
    if a != e:
        raise AssertionError(f'{l}: expected={e!r}, got={a!r}')
    print(f'  [OK] {l} = {a!r}')


def main():
    admin_token = login('admin_test', 'test123')
    target_token = login('viewer_test', 'test123')

    # ===== 测试 1: 非 admin 访问应 403 =====
    print('\n[1] viewer_test 访问 /admin/audit-logs 应 403')
    code, _ = call('GET', 'http://localhost:8004/api/v1/admin/audit-logs',
                   token=target_token)
    assert_eq(code, 403, 'status')

    # ===== 测试 2: admin 访问应 200 =====
    print('\n[2] admin 访问应 200')
    code, all_logs = call('GET', 'http://localhost:8004/api/v1/admin/audit-logs',
                          token=admin_token)
    assert_eq(code, 200, 'status')
    print(f'  total = {all_logs["total"]}')
    assert all_logs['total'] >= 1, '应当至少有 1 条历史日志'
    # 检查带 username
    if all_logs['items']:
        sample = all_logs['items'][0]
        print(f'  sample: action={sample["action"]} username={sample.get("username")} resource={sample["resource_type"]}')

    # ===== 测试 3: 触发新日志 — 创建 KB + 邀请成员 =====
    print('\n[3] 触发新审计日志：创建 KB + 邀请')
    kb_name = f'audit-test-{int(time.time())}'
    code, new_coll = call('POST', 'http://localhost:8004/api/v1/collections',
                          token=admin_token, body={'name': kb_name})
    coll_id = new_coll['id']
    code, _ = call('POST', f'http://localhost:8004/api/v1/collections/{coll_id}/acl',
                   token=admin_token, body={'username': 'viewer_test', 'role': 'viewer'})
    assert_eq(code, 201, 'invite')

    # ===== 测试 4: 按 action=acl.grant 过滤 =====
    print('\n[4] filter by action=acl.grant')
    code, filtered = call('GET',
                          'http://localhost:8004/api/v1/admin/audit-logs?action=acl.grant',
                          token=admin_token)
    assert_eq(code, 200, 'status')
    assert filtered['total'] >= 1, '应至少 1 条 acl.grant 日志'
    # 所有返回记录的 action 应都是 acl.grant
    for item in filtered['items']:
        assert item['action'] == 'acl.grant', f'filter 不正确: {item}'
    print(f'  [OK] 全部 {filtered["total"]} 条都是 acl.grant')

    # ===== 测试 5: 按 resource_type=document 过滤 =====
    print('\n[5] filter by resource_type=document')
    code, filtered = call('GET',
                          'http://localhost:8004/api/v1/admin/audit-logs?resource_type=document',
                          token=admin_token)
    assert_eq(code, 200, 'status')
    print(f'  doc logs total = {filtered["total"]}')
    for item in filtered['items']:
        assert item['resource_type'] == 'document', f'filter 不正确: {item}'
    print('  [OK] 全部 doc 类型')

    # ===== 测试 6: 按 resource_id 查特定资源 =====
    print('\n[6] filter by resource_id=刚创建 KB')
    code, filtered = call('GET',
                          f'http://localhost:8004/api/v1/admin/audit-logs?resource_id={coll_id}',
                          token=admin_token)
    assert_eq(code, 200, 'status')
    print(f'  KB logs total = {filtered["total"]}')
    assert filtered['total'] >= 1
    # 应该至少 1 条 acl.grant（邀请 viewer_test）
    actions = {item['action'] for item in filtered['items']}
    assert 'acl.grant' in actions, f'应至少有 acl.grant，实际 {actions}'
    print(f'  [OK] actions = {actions}')

    # ===== 测试 7: 按 user_id 查 admin_test 的操作 =====
    print('\n[7] filter by user_id=admin_test')
    code, me = call('GET', 'http://localhost:8004/api/v1/auth/me', token=admin_token)
    admin_uid = me['id']
    code, filtered = call('GET',
                          f'http://localhost:8004/api/v1/admin/audit-logs?user_id={admin_uid}&limit=20',
                          token=admin_token)
    assert_eq(code, 200, 'status')
    print(f'  admin 操作日志 total = {filtered["total"]}')
    assert all(item['user_id'] == admin_uid for item in filtered['items'])
    print('  [OK] 全部是 admin_test 的操作')

    print('\n所有 Task 9 API 验证通过!')


if __name__ == '__main__':
    main()
