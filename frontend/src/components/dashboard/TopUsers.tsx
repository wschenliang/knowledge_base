"use client";

import { Users } from "lucide-react";
import type { TopUserItem } from "@/types";

interface Props {
  items: TopUserItem[];
}

function avatarColor(name: string): string {
  const colors = [
    "bg-blue-100 text-blue-700",
    "bg-emerald-100 text-emerald-700",
    "bg-violet-100 text-violet-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function TopUsers({ items }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
          <Users className="h-4 w-4 text-blue-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">活跃用户 Top 10</h3>
      </div>

      {items.length === 0 ? (
        <div className="flex h-72 items-center justify-center text-sm text-slate-400">
          暂无数据
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((user, idx) => {
            const display = user.display_name || user.username;
            const initial = display.charAt(0).toUpperCase();
            return (
              <div
                key={user.user_id}
                className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50 transition-colors"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600">
                  {idx + 1}
                </span>
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarColor(display)}`}
                >
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{display}</p>
                  <p className="truncate text-xs text-slate-500">@{user.username}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-blue-600">{user.message_count}</p>
                  <p className="text-xs text-slate-400">{user.conversation_count} 对话</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}