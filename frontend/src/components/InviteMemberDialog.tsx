"use client";

import { useState } from "react";
import { X, UserPlus } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  collectionId: string;
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}

export default function InviteMemberDialog({
  collectionId,
  open,
  onClose,
  onInvited,
}: Props) {
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("viewer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleSubmit() {
    if (!username.trim()) return;
    setLoading(true);
    setError("");
    try {
      await api.inviteCollectionMember(collectionId, { username, role });
      setUsername("");
      onInvited();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "邀请失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">邀请成员</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="输入要邀请的用户名"
              autoFocus
              className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              角色
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
              className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none"
            >
              <option value="viewer">访客（只读）</option>
              <option value="editor">编辑者（可上传/删除文档）</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={loading || !username.trim()}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              {loading ? "邀请中..." : "邀请"}
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
