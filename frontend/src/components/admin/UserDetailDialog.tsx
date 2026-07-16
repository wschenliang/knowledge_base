import { X, FolderOpen, MessageSquare, MessagesSquare, Clock } from "lucide-react";
import type { UserDetailResponse } from "@/types";

interface UserDetailDialogProps {
  open: boolean;
  user: UserDetailResponse | null;
  onClose: () => void;
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("zh-CN");
}

export default function UserDetailDialog({ open, user, onClose }: UserDetailDialogProps) {
  if (!open || !user) return null;

  const stats = [
    { label: "知识库数", value: user.collection_count, icon: FolderOpen },
    { label: "对话数", value: user.conversation_count, icon: MessageSquare },
    { label: "消息数", value: user.message_count, icon: MessagesSquare },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">用户详情</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500">用户名</p>
              <p className="text-sm font-medium text-slate-800">{user.username}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">显示名</p>
              <p className="text-sm font-medium text-slate-800">{user.display_name || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">邮箱</p>
              <p className="text-sm font-medium text-slate-800">{user.email || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">角色</p>
              <p className="text-sm font-medium text-slate-800">
                {user.role === "admin" ? "管理员" : "普通用户"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">状态</p>
              <p className="text-sm font-medium text-slate-800">
                {user.is_active ? "活跃" : "禁用"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">注册时间</p>
              <p className="text-sm font-medium text-slate-800">{formatDateTime(user.created_at)}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              最后登录
            </p>
            <p className="text-sm font-medium text-slate-800">{formatDateTime(user.last_login_at)}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                <s.icon className="mx-auto h-4 w-4 text-slate-400" />
                <p className="mt-1 text-lg font-bold text-slate-900">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}