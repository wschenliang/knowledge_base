// 前端 ACL 角色判断 helper（与后端 ROLE_PRIORITY 保持一致）

import type { User, AclRole } from "@/types";

const ROLE_PRIORITY: Record<AclRole, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
};

export function isAdmin(user: User | null | undefined): boolean {
  return !!user && user.role === "admin";
}

export function isOwner(role: AclRole | undefined | null): boolean {
  return role === "owner";
}

export function isEditor(role: AclRole | undefined | null): boolean {
  return role === "editor" || role === "owner"; // owner 含 editor 权限
}

export function isViewer(role: AclRole | undefined | null): boolean {
  return role === "viewer" || role === "editor" || role === "owner";
}

export function hasRole(
  role: AclRole | undefined | null,
  minRole: AclRole,
): boolean {
  if (!role) return false;
  return ROLE_PRIORITY[role] >= ROLE_PRIORITY[minRole];
}

/** 当前用户对此 KB 能否管理成员（owner 或 admin） */
export function canManageMembers(role: AclRole | undefined | null): boolean {
  return role === "owner";
}

/** 当前用户能否编辑文档（editor+） */
export function canEdit(role: AclRole | undefined | null): boolean {
  return isEditor(role);
}

/** 当前用户能否查看（viewer+） */
export function canView(role: AclRole | undefined | null): boolean {
  return isViewer(role);
}
