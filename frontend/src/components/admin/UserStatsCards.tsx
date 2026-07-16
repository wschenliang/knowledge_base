import { Users, UserCheck, Shield, UserPlus } from "lucide-react";
import type { UserStats } from "@/types";

interface UserStatsCardsProps {
  stats: UserStats | null;
}

export default function UserStatsCards({ stats }: UserStatsCardsProps) {
  const cards = [
    {
      label: "总用户",
      value: stats?.total_users ?? 0,
      icon: Users,
      color: "bg-blue-50 text-blue-600",
    },
    {
      label: "活跃用户",
      value: stats?.active_users ?? 0,
      icon: UserCheck,
      color: "bg-green-50 text-green-600",
    },
    {
      label: "管理员",
      value: stats?.admin_users ?? 0,
      icon: Shield,
      color: "bg-amber-50 text-amber-600",
    },
    {
      label: "今日新增",
      value: stats?.new_today ?? 0,
      icon: UserPlus,
      color: "bg-purple-50 text-purple-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${card.color}`}>
              <card.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs text-slate-500">{card.label}</p>
              <p className="text-lg font-bold text-slate-900">{card.value}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}