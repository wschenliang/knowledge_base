"""Task 6 API 验证脚本：6 个 ACL 管理端点"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request


def call(method, url, token=None, body=None):
    req = urllib.request.Request(url, method=method)
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    if body is not None:
        req.add_header('Content-Type', 'application/json')
        data = json.dumps(body).encode('utf-8')
    else:
        data = None
    try:
        with urllib.request.urlopen(req, data=data) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        return e.code, json.loads(raw) if raw else None


BASE = 'http://localhost:8004/api/v1'


def login(username, password):
    code, data = call('POST', f'{BASE}/auth/login', body={'username': username, 'password': password})
    assert code == 200, f'login {username} failed: {code} {data}'
    return data['access_token']


def assert_eq(actual, expected, label):
    """断言助手：打印实际值便于调试"""
    if actual != expected:
        raise AssertionError(f'{label}: expected={expected!r}, got={actual!r}')
    print(f'  [OK] {label} = {actual!r}')


def main():
    admin_token = login('admin_test', 'test123')
    target_token = login('viewer_test', 'test123')  # 普通用户，作为邀请目标

    # ===== 准备 =====
    kb_name = f'acl-api-test-{int(time.time())}'
    code, new_coll = call('POST', f'{BASE}/collections', token=admin_token,
                          body={'name': kb_name, 'description': 'ACL API 测试'})
    assert code == 201, f'create KB: {code} {new_coll}'
    coll_id = new_coll['id']
    print(f'\n[setup] KB 创建: id={coll_id[:8]}, name={kb_name}')

    # 拿 viewer_test 的 user_id（用 /auth/me）
    code, me = call('GET', f'{BASE}/auth/me', token=target_token)
    target_user_id = me['id']
    print(f'[setup] target user_id = {target_user_id[:8]}')

    # ===== Step 1: GET /acl — owner admin 应看到自己 =====
    print('\n[1] GET /acl — admin 列出成员')
    code, members = call('GET', f'{BASE}/collections/{coll_id}/acl', token=admin_token)
    assert_eq(code, 200, 'status')
    assert_eq(len(members['items']), 1, 'initial member count')
    assert_eq(members['items'][0]['role'], 'owner', 'only member is owner')

    # ===== Step 2: POST /acl — admin 邀请 viewer_test 当 viewer (201) =====
    print('\n[2] POST /acl — admin 邀请 viewer_test 为 viewer')
    code, m1 = call('POST', f'{BASE}/collections/{coll_id}/acl', token=admin_token,
                    body={'username': 'viewer_test', 'role': 'viewer'})
    assert_eq(code, 201, 'status')
    assert_eq(m1['role'], 'viewer', 'granted role')
    assert_eq(m1['username'], 'viewer_test', 'granted username')

    # ===== Step 3: POST /acl — 重复邀请 → 409 =====
    print('\n[3] POST /acl — 重复邀请 viewer_test 应 409')
    code, err = call('POST', f'{BASE}/collections/{coll_id}/acl', token=admin_token,
                     body={'username': 'viewer_test', 'role': 'viewer'})
    assert_eq(code, 409, 'status')

    # ===== Step 4: GET /acl — 应有 2 个成员 =====
    print('\n[4] GET /acl — 列出全部 2 个成员')
    code, members = call('GET', f'{BASE}/collections/{coll_id}/acl', token=admin_token)
    assert_eq(code, 200, 'status')
    assert_eq(members['total'], 2, 'total')
    roles = sorted(m['role'] for m in members['items'])
    assert_eq(roles, ['owner', 'viewer'], 'roles')

    # ===== Step 5: PUT /acl/{user_id} — viewer 升为 editor =====
    print('\n[5] PUT /acl/{user_id} — viewer_test 升为 editor')
    code, m2 = call('PUT', f'{BASE}/collections/{coll_id}/acl/{target_user_id}',
                    token=admin_token, body={'role': 'editor'})
    assert_eq(code, 200, 'status')
    assert_eq(m2['role'], 'editor', 'new role')

    # ===== Step 6: POST /acl/transfer — 把所有权转给 viewer_test（已是 viewer 成员） =====
    print('\n[6] POST /acl/transfer — 转移所有权 viewer_test ← admin_test')
    code, tx = call('POST', f'{BASE}/collections/{coll_id}/acl/transfer', token=admin_token,
                    body={'new_owner_username': 'viewer_test'})
    assert_eq(code, 200, 'status')
    assert_eq(tx['new_owner_id'], target_user_id, 'new owner id matches')

    # ===== Step 7: 新 owner 应是 viewer_test，admin 应是 editor =====
    print('\n[7] GET /acl — viewer_test (新 owner) 查看成员表')
    code, members = call('GET', f'{BASE}/collections/{coll_id}/acl', token=target_token)
    assert_eq(code, 200, 'status')
    member_map = {m['username']: m['role'] for m in members['items']}
    assert_eq(member_map.get('viewer_test'), 'owner', 'viewer_test is now owner')
    assert_eq(member_map.get('admin_test'), 'editor', 'admin_test is now editor')

    # ===== Step 8: 双方都能 GET /collections/{id} =====
    print('\n[8] GET /collections/{id} — 双方都能访问')
    code, c1 = call('GET', f'{BASE}/collections/{coll_id}', token=target_token)
    assert_eq(code, 200, 'viewer_test (owner) GET')
    code, c2 = call('GET', f'{BASE}/collections/{coll_id}', token=admin_token)
    assert_eq(code, 200, 'admin_test (editor) GET')

    # ===== Step 9: 新 owner DELETE admin_test (admin 现在是 editor 可删) =====
    print('\n[9] DELETE /acl/{admin_id} — viewer_test 移除 admin_test')
    code, admin_me = call('GET', f'{BASE}/auth/me', token=admin_token)
    admin_user_id = admin_me['id']
    code, del_resp = call('DELETE', f'{BASE}/collections/{coll_id}/acl/{admin_user_id}',
                           token=target_token)
    assert_eq(code, 204, 'status')

    # ===== Step 10: viewer_test 试图删除自己（owner）应 400 =====
    print('\n[10] DELETE /acl/{self} — 试图移除 owner 应 400')
    code, _ = call('DELETE', f'{BASE}/collections/{coll_id}/acl/{target_user_id}',
                   token=target_token)
    assert_eq(code, 400, 'status')

    print('\n所有 Task 6 API 验证通过!')


if __name__ == '__main__':
    main()
