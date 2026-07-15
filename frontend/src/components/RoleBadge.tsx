"use client";

import { Crown, Pencil, Eye } from "lucide-react";
import type { AclRole } from "@/types";

interface Props {
  role: AclRole;
  size?: "sm" | "md";
}

const config: Record<AclRole, {
  label: string;
  // 用 React.ElementType 代替 typeof Crown 让 TS 工具链更轻
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Icon: any;
  className: string;
}> = {
  owner: {
    label: "Owner",
    Icon: Crown,
    className: "bg-violet-100 text-violet-700 border-violet-200",
  },
  editor: {
    label: "Editor",
    Icon: Pencil,
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  viewer: {
    label: "Viewer",
    Icon: Eye,
    className: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

export default function RoleBadge({ role, size = "md" }: Props) {
  const { label, Icon, className } = config[role];
  const sizing =
    size === "sm" ? "text-[10px] px-1.5 py-0.5 gap-1" : "text-xs px-2 py-0.5 gap-1";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${sizing} ${className}`}
    >
      <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {label}
    </span>
  );
}
