"use client";

import { Database } from "lucide-react";
import type { TopCollectionItem } from "@/types";

interface Props {
  items: TopCollectionItem[];
}

export default function TopCollections({ items }: Props) {
  const maxCount = Math.max(...items.map((i) => i.question_count), 1);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50">
          <Database className="h-4 w-4 text-violet-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">热门知识库</h3>
      </div>

      {items.length === 0 ? (
        <div className="flex h-72 items-center justify-center text-sm text-slate-400">
          暂无数据
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => {
            const pct = (item.question_count / maxCount) * 100;
            return (
              <div key={item.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-600">
                      {idx + 1}
                    </span>
                    <span className="truncate font-medium text-slate-900">{item.name}</span>
                    {item.owner_username && (
                      <span className="shrink-0 text-xs text-slate-400">
                        @{item.owner_username}
                      </span>
                    )}
                  </div>
                  <span className="ml-2 shrink-0 text-sm font-semibold text-violet-600">
                    {item.question_count}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-600 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}