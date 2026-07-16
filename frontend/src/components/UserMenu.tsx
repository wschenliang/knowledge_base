"use client";

import { useEffect, useRef, useState } from "react";
import {
  User as UserIcon,
  Settings as SettingsIcon,
  HelpCircle,
  LogOut,
  ChevronRight,
} from "lucide-react";
import type { User } from "@/types";

interface Props {
  user: User;
  /** 头像的 dataURL，组件内部负责展示 */
  avatar: string | null;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onLogout: () => void;
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  /** 右侧箭头（如"个性化"扩展项） */
  withArrow?: boolean;
  danger?: boolean;
}

function MenuItem({ icon, label, onClick, withArrow, danger }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
        danger
          ? "text-slate-700 hover:bg-red-50 hover:text-red-600"
          : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      <span className={`flex h-4 w-4 items-center justify-center ${danger ? "text-slate-500 group-hover:text-red-500" : "text-slate-500"}`}>
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {withArrow && (
        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
      )}
    </button>
  );
}

/**
 * 侧边栏左下角的用户菜单
 *
 * - 触发按钮：圆形头像 + 用户名 + 角色/版本 + 右侧箭头
 * - 点击触发后向上弹出菜单，包含：
 *   1. 用户信息卡（头像 + 名称 + 用户名）
 *   2. 个人资料 / 设置 / 帮助
 *   3. 退出登录（带分隔线、危险样式）
 * - 点击外部或 Esc 自动关闭
 */
export default function UserMenu({
  user,
  avatar,
  onOpenProfile,
  onOpenSettings,
  onOpenHelp,
  onLogout,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = user.display_name || user.username || "未命名用户";
  const initial = displayName.charAt(0).toUpperCase();
  const versionLabel = user.role === "admin" ? "管理员" : "免费版";

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {/* 触发按钮（替代原 ConversationList 中的整块用户区） */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex w-full items-center gap-2.5 rounded-lg p-1.5 transition-colors ${
          open ? "bg-slate-200/70" : "hover:bg-slate-200/60"
        }`}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt="头像"
            className="h-8 w-8 shrink-0 rounded-full object-cover shadow-sm"
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-semibold text-white shadow-sm">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-[13px] font-medium text-slate-800">
            {displayName}
          </p>
          <p className="truncate text-[11px] text-slate-500">{versionLabel}</p>
        </div>
        <ChevronRight
          className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {/* 弹出菜单：向上展开，固定宽度 */}
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5 py-1.5 z-40 animate-in fade-in slide-in-from-bottom-1"
        >
          {/* 用户信息卡 */}
          <div className="flex items-center gap-2.5 px-3 py-2 border-b border-slate-100">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt="头像"
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-semibold text-white">
                {initial}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-slate-800">
                {displayName}
              </p>
              <p className="truncate text-[11px] text-slate-500">
                {versionLabel}
              </p>
            </div>
          </div>

          {/* 菜单项 */}
          <div className="py-1">
            <MenuItem
              icon={<UserIcon className="h-4 w-4" />}
              label="个人资料"
              onClick={() => {
                setOpen(false);
                onOpenProfile();
              }}
            />
            <MenuItem
              icon={<SettingsIcon className="h-4 w-4" />}
              label="设置"
              onClick={() => {
                setOpen(false);
                onOpenSettings();
              }}
            />
            <MenuItem
              icon={<HelpCircle className="h-4 w-4" />}
              label="帮助"
              onClick={() => {
                setOpen(false);
                onOpenHelp();
              }}
            />
          </div>

          <div className="border-t border-slate-100 pt-1">
            <MenuItem
              icon={<LogOut className="h-4 w-4" />}
              label="退出登录"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              danger
            />
          </div>
        </div>
      )}
    </div>
  );
}