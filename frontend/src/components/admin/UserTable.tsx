import { Eye, Pencil, Lock, Ban, CheckCircle, Loader2, Users } from "lucide-react";
import type { UserListItem } from "@/types";

interface UserTableProps {
  users: UserListItem[];
  loading: boolean;
  onView: (user: UserListItem) => void;
  onEdit: (user: UserListItem) => void;
  onToggleStatus: (user: UserListItem) => void;
  onResetPassword: (user: UserListItem) => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function RoleBadge({ role }: { role: string }) {
  if (role === "admin")
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        管理员
      </span>
    );
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      用户
    </span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  if (isActive)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle className="h-3 w-3" />
        活跃
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      <Ban className="h-3 w-3" />
      禁用
    </span>
  );
}

export default function UserTable({
  users,
  loading,
  onView,
  onEdit,
  onToggleStatus,
  onResetPassword,
}: UserTableProps) {
  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        <span className="ml-2 text-sm text-slate-500">加载中...</span>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Users className="h-10 w-10 text-slate-300" />
        <p className="mt-2 text-sm text-slate-500">暂无用户</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/50">
            <th className="px-4 py-3 text-left font-medium text-slate-500">用户名</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">显示名</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">邮箱</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">角色</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">状态</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">注册时间</th>
            <th className="px-4 py-3 text-right font-medium text-slate-500">操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
            >
              <td className="px-4 py-3 font-medium text-slate-800">{user.username}</td>
              <td className="px-4 py-3 text-slate-600">{user.display_name || "-"}</td>
              <td className="px-4 py-3 text-xs text-slate-500">{user.email || "-"}</td>
              <td className="px-4 py-3">
                <RoleBadge role={user.role} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge isActive={user.is_active} />
              </td>
              <td className="px-4 py-3 text-xs text-slate-500">{formatDate(user.created_at)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onView(user)}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    title="查看详情"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onEdit(user)}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    title="编辑"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onToggleStatus(user)}
                    className={`rounded-lg p-1.5 hover:bg-slate-100 ${
                      user.is_active ? "text-red-500 hover:text-red-700" : "text-green-500 hover:text-green-700"
                    }`}
                    title={user.is_active ? "禁用" : "启用"}
                  >
                    {user.is_active ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => onResetPassword(user)}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    title="重置密码"
                  >
                    <Lock className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}