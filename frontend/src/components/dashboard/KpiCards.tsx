"use client";

import { Users, Database, FileText, MessageSquare } from "lucide-react";
import type { DashboardKPI } from "@/types";

interface Props {
  kpi: DashboardKPI;
  scope: "admin" | "user";
}

const cards = [
  {
    key: "total_users",
    label: "用户",
    Icon: Users,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
  },
  {
    key: "total_collections",
    label: "知识库",
    Icon: Database,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-600",
  },
  {
    key: "total_documents",
    label: "文档",
    Icon: FileText,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
  {
    key: "total_messages",
    label: "问答消息",
    Icon: MessageSquare,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
] as const;

function formatNumber(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}K`;
  return n.toString();
}

export default function KpiCards({ kpi, scope }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.Icon;
        const value = kpi[card.key as keyof DashboardKPI] as number;
        return (
          <div
            key={card.key}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.iconBg}`}>
                <Icon className={`h-5 w-5 ${card.iconColor}`} />
              </div>
              {card.key === "total_messages" && kpi.today_messages > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  今日 {kpi.today_messages}
                </span>
              )}
            </div>
            <div className="mt-4">
              <p className="text-3xl font-bold text-slate-900">{formatNumber(value)}</p>
              <p className="mt-1 text-sm text-slate-500">
                {card.label}
                {scope === "user" && card.key === "total_users" && " (本人)"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}