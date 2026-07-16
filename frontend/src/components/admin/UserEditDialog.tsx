import { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { UserListItem } from "@/types";

interface UserEditDialogProps {
  open: boolean;
  user: UserListItem | null;
  onSave: (userId: string, data: { display_name?: string; role?: string }) => void;
  onClose: () => void;
}

export default function UserEditDialog({ open, user, onSave, onClose }: UserEditDialogProps) {
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("user");

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || "");
      setRole(user.role);
    }
  }, [user]);

  if (!open || !user) return null;

  const handleSave = () => {
    const data: { display_name?: string; role?: string } = {};
    if (displayName !== (user.display_name || "")) data.display_name = displayName;
    if (role !== user.role) data.role = role;
    onSave(user.id, data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">编辑用户</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">用户名</label>
            <p className="mt-1 text-sm text-slate-500">{user.username}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">显示名</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              maxLength={255}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">角色</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
