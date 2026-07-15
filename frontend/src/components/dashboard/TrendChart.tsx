"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";
import type { DashboardTrends } from "@/types";

interface Props {
  trends: DashboardTrends;
  showDocuments: boolean;
}

export default function TrendChart({ trends, showDocuments }: Props) {
  // 合并数据
  const dataMap = new Map<string, { date: string; messages: number; documents: number }>();
  for (const m of trends.daily_messages) {
    dataMap.set(m.date, { date: m.date, messages: m.count, documents: 0 });
  }
  for (const d of trends.daily_documents) {
    const existing = dataMap.get(d.date) || { date: d.date, messages: 0, documents: 0 };
    existing.documents = d.count;
    dataMap.set(d.date, existing);
  }
  const data = Array.from(dataMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  const hasData = data.some((d) => d.messages > 0 || d.documents > 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50">
          <TrendingUp className="h-4 w-4 text-blue-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">使用趋势</h3>
      </div>

      {!hasData ? (
        <div className="flex h-72 items-center justify-center text-sm text-slate-400">
          暂无数据
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={288}>
          <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              stroke="#94a3b8"
              fontSize={11}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis stroke="#94a3b8" fontSize={11} />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="messages"
              name="问答数"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            {showDocuments && (
              <Line
                type="monotone"
                dataKey="documents"
                name="文档上传"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}