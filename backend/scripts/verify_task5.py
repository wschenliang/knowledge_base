"""Task 5 API 验证脚本"""
import urllib.request
import urllib.error
import json
import time


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
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


BASE = 'http://localhost:8004/api/v1'


def login(username, password):
    code, data = call('POST', f'{BASE}/auth/login', body={'username': username, 'password': password})
    assert code == 200, f'login failed: {code} {data}'
    return data['access_token']


def main():
    # 1. admin 登录 + 列出 collections
    admin_token = login('admin_test', 'test123')
    code, colls = call('GET', f'{BASE}/collections', token=admin_token)
    print(f'[admin] GET /collections: code={code}, total={colls.get("total")}, items={len(colls.get("items", []))}')
    for c in colls.get('items', []):
        print(f'  - {c["name"]} (owner_id={c.get("owner_id")})')

    # 2. viewer 登录 + 列出 collections（应为空）
    viewer_token = login('viewer_test', 'test123')
    code, colls2 = call('GET', f'{BASE}/collections', token=viewer_token)
    print(f'[viewer] GET /collections: code={code}, total={colls2.get("total")}, items={len(colls2.get("items", []))}')

    # 3. admin 创建 KB（用唯一名称避免与历史残留冲突，脚本可重复执行）
    kb_name = f'acl-test-kb-{int(time.time())}'
    code, new_coll = call('POST', f'{BASE}/collections', token=admin_token,
                           body={'name': kb_name, 'description': '测试 ACL'})
    print(f'[admin] POST /collections: code={code}, name={new_coll.get("name")}, id={new_coll.get("id")}')
    coll_id = new_coll.get('id')

    # 4. admin 列出 collections 应包含新建的 KB
    code, colls3 = call('GET', f'{BASE}/collections', token=admin_token)
    print(f'[admin] after create, GET /collections: total={colls3.get("total")}')
    assert any(c['id'] == coll_id for c in colls3.get('items', [])), 'admin should see new KB'

    # 5. viewer 列出 collections 应仍为空
    code, colls4 = call('GET', f'{BASE}/collections', token=viewer_token)
    print(f'[viewer] after admin create, GET /collections: total={colls4.get("total")}')
    assert not any(c['id'] == coll_id for c in colls4.get('items', [])), 'viewer should NOT see new KB'

    # 6. viewer 尝试直接 GET 这个 KB（应 403）
    code, detail = call('GET', f'{BASE}/collections/{coll_id}', token=viewer_token)
    print(f'[viewer] GET /collections/{coll_id[:8]}: code={code}, detail={detail.get("detail")}')

    print()
    print('Task 5 API 验证通过!')


if __name__ == '__main__':
    main()