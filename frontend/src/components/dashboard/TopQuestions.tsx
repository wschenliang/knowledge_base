"use client";

import { Search } from "lucide-react";
import type { TopQuestionItem } from "@/types";

interface Props {
  items: TopQuestionItem[];
}

export default function TopQuestions({ items }: Props) {
  const maxCount = Math.max(...items.map((i) => i.count), 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
          <Search className="h-4 w-4 text-emerald-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">高频问题</h3>
      </div>

      {items.length === 0 ? (
        <div className="flex h-72 items-center justify-center text-sm text-slate-400">
          暂无数据
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => {
            // 字号随频次变化（基于最大值的比例缩放）
            const size = 12 + Math.round((item.count / maxCount) * 12);
            const intensity = item.count / maxCount;
            const bgClass =
              intensity > 0.7
                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                : intensity > 0.4
                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                : "bg-slate-50 text-slate-700 border-slate-200";
            return (
              <div
                key={item.query}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 transition-all hover:shadow-sm cursor-default ${bgClass}`}
                style={{ fontSize: `${size}px` }}
                title={`出现 ${item.count} 次${item.last_asked_at ? `，最近 ${new Date(item.last_asked_at).toLocaleDateString("zh-CN")}` : ""}`}
              >
                <span className="font-medium">{item.query}</span>
                <span className="text-xs opacity-70">×{item.count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}