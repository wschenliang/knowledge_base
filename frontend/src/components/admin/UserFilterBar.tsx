import { Search } from "lucide-react";

interface UserFilterBarProps {
  keyword: string;
  role: string;
  isActive: string;
  onKeywordChange: (v: string) => void;
  onRoleChange: (v: string) => void;
  onIsActiveChange: (v: string) => void;
}

export default function UserFilterBar({
  keyword,
  role,
  isActive,
  onKeywordChange,
  onRoleChange,
  onIsActiveChange,
}: UserFilterBarProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索用户名/邮箱..."
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <select
          value={role}
          onChange={(e) => onRoleChange(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">全部角色</option>
          <option value="user">普通用户</option>
          <option value="admin">管理员</option>
        </select>

        <select
          value={isActive}
          onChange={(e) => onIsActiveChange(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">全部状态</option>
          <option value="true">活跃</option>
          <option value="false">禁用</option>
        </select>
      </div>
    </div>
  );
}