"use client";

import { RefreshCw } from "lucide-react";

interface Props {
  scope: "admin" | "user";
  rangeDays: number;
  onRefresh: () => void;
  loading: boolean;
}

export default function DashboardHeader({ scope, rangeDays, onRefresh, loading }: Props) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - rangeDays + 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          {scope === "admin" ? "全站数据" : "我的数据"} · {fmt(start)} 至 {fmt(today)}
        </p>
      </div>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-all"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        刷新
      </button>
    </div>
  );
}