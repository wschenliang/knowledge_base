"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Layout from "@/components/Layout";
import type { UserListItem, UserDetailResponse, UserStats } from "@/types";
import { ShieldCheck, AlertCircle, Users, ChevronLeft, ChevronRight } from "lucide-react";

import UserStatsCards from "@/components/admin/UserStatsCards";
import UserFilterBar from "@/components/admin/UserFilterBar";
import UserTable from "@/components/admin/UserTable";
import UserDetailDialog from "@/components/admin/UserDetailDialog";
import UserEditDialog from "@/components/admin/UserEditDialog";
import ConfirmDialog from "@/components/ConfirmDialog";

const PAGE_SIZE = 30;

export default function AdminUsersPage() {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);

  // 筛选
  const [keyword, setKeyword] = useState("");
  const [role, setRole] = useState("");
  const [isActive, setIsActive] = useState("");

  // 弹窗
  const [detailUser, setDetailUser] = useState<UserDetailResponse | null>(null);
  const [editUser, setEditUser] = useState<UserListItem | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ open: false, title: "", message: "", onConfirm: () => {} });

  const loadStats = useCallback(async () => {
    try {
      const data = await api.getUserStats();
      setStats(data);
    } catch (err) {
      console.error("加载统计失败", err);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params: Record<string, unknown> = {
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      };
      if (keyword) params.keyword = keyword;
      if (role) params.role = role;
      if (isActive) params.is_active = isActive === "true";
      const data = await api.listUsers(params);
      setUsers(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, keyword, role, isActive]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadStats();
      loadUsers();
    }
  }, [authLoading, isAuthenticated, loadStats, loadUsers]);

  useEffect(() => {
    setPage(0);
  }, [keyword, role, isActive]);

  const handleView = async (u: UserListItem) => {
    try {
      const detail = await api.getUserDetail(u.id);
      setDetailUser(detail);
    } catch (err) {
      alert(err instanceof Error ? err.message : "加载详情失败");
    }
  };

  const handleEdit = (u: UserListItem) => {
    setEditUser(u);
  };

  const handleSaveEdit = async (userId: string, data: { display_name?: string; role?: "user" | "admin" }) => {
    try {
      await api.updateUser(userId, data);
      setEditUser(null);
      loadUsers();
      loadStats();
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新失败");
    }
  };

  const handleToggleStatus = (u: UserListItem) => {
    const action = u.is_active ? "禁用" : "启用";
    setConfirmDialog({
      open: true,
      title: `${action}账号`,
      message: `确定要${action}用户 "${u.username}" 吗？`,
      onConfirm: async () => {
        try {
          await api.toggleUserStatus(u.id);
          setConfirmDialog((prev) => ({ ...prev, open: false }));
          loadUsers();
          loadStats();
        } catch (err) {
          alert(err instanceof Error ? err.message : "操作失败");
        }
      },
    });
  };

  const handleResetPassword = (u: UserListItem) => {
    setConfirmDialog({
      open: true,
      title: "重置密码",
      message: `确定要为用户 "${u.username}" 发送密码重置邮件吗？`,
      onConfirm: async () => {
        try {
          await api.resetUserPassword(u.id);
          setConfirmDialog((prev) => ({ ...prev, open: false }));
          alert("密码重置邮件已发送");
        } catch (err) {
          alert(err instanceof Error ? err.message : "发送失败");
        }
      },
    });
  };

  if (authLoading) return null;

  if (user?.role !== "admin") {
    return (
      <Layout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <ShieldCheck className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">仅管理员可访问用户管理</p>
          </div>
        </div>
      </Layout>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* 页头 */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">用户管理</h1>
              <p className="text-xs text-slate-500">管理系统所有用户账号</p>
            </div>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="mb-6">
          <UserStatsCards stats={stats} />
        </div>

        {/* 筛选栏 */}
        <div className="mb-4">
          <UserFilterBar
            keyword={keyword}
            role={role}
            isActive={isActive}
            onKeywordChange={setKeyword}
            onRoleChange={setRole}
            onIsActiveChange={setIsActive}
          />
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-100 p-3.5 text-sm text-red-600 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
            <button
              onClick={() => loadUsers()}
              className="ml-auto text-xs font-medium text-red-700 hover:underline"
            >
              重试
            </button>
          </div>
        )}

        {/* 用户表格 */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <UserTable
            users={users}
            loading={loading}
            onView={handleView}
            onEdit={handleEdit}
            onToggleStatus={handleToggleStatus}
            onResetPassword={handleResetPassword}
          />

          {/* 分页 */}
          {total > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3">
              <span className="text-xs text-slate-500">
                共 {total} 条记录，第 {page + 1}/{totalPages} 页
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  下一页
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 弹窗 */}
      <UserDetailDialog
        open={!!detailUser}
        user={detailUser}
        onClose={() => setDetailUser(null)}
      />
      <UserEditDialog
        open={!!editUser}
        user={editUser}
        onSave={handleSaveEdit}
        onClose={() => setEditUser(null)}
      />
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
      />
    </Layout>
  );
}
