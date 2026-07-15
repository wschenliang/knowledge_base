"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import type { ConversationItem } from "@/types";
import {
  Plus,
  Search,
  Database,
  BookOpen,
  Sparkles,
  BarChart3,
  LogOut,
  MessageSquare,
  PanelLeftClose,
} from "lucide-react";

interface Props {
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onCollapse?: () => void;
  refreshKey?: number; // 用于触发刷新（例如新建/删除对话后）
  /** 是否显示对话历史区。仅聊天页为 true，其他页隐藏避免干扰。 */
  showConversations?: boolean;
}

const toolItems = [
  { href: "/dashboard", label: "数据概览", icon: BarChart3 },
  { href: "/knowledge-bases", label: "我的知识库", icon: BookOpen },
  { href: "/search", label: "语义搜索", icon: Search },
  { href: "/chat", label: "智能问答", icon: Sparkles },
];

export default function ChatSidebar({
  activeConversationId,
  onSelect,
  onNew,
  onDelete,
  onCollapse,
  refreshKey,
  showConversations = true,
}: Props) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(showConversations);

  const load = useCallback(async () => {
    if (!showConversations) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const result = await api.listConversations();
      setConversations(result.items);
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setLoading(false);
    }
  }, [showConversations]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await api.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      onDelete(id);
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} 天前`;
    return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col bg-slate-50">
      {/* 品牌头部 */}
      <div className="flex h-14 items-center justify-between px-3">
        <button className="group flex h-9 items-center gap-2 rounded-lg px-2 hover:bg-slate-200/60 transition-colors">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-indigo-600">
            <Database className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-semibold text-slate-800">KnowledgeBase</span>
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-slate-500 transition-transform group-hover:translate-y-0.5" fill="currentColor">
            <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" />
          </svg>
        </button>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/60 hover:text-slate-700 transition-colors"
            title="收起侧栏"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 新建对话按钮 */}
      <div className="px-3">
        <button
          onClick={onNew}
          className="group flex w-full h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white pl-3 pr-2 text-left shadow-sm hover:bg-slate-50 transition-all"
        >
          <Plus className="h-4 w-4 text-slate-700" strokeWidth={2.2} />
          <span className="flex-1 text-sm font-medium text-slate-700">新建对话</span>
          <kbd className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 group-hover:bg-slate-200 sm:inline-block">⌘K</kbd>
        </button>
      </div>

      {/* 功能模块 */}
      <div className="mt-4 px-3 space-y-0.5">
        {toolItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-slate-200/60 text-slate-900 font-medium"
                  : "text-slate-600 hover:bg-slate-200/60"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.8} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* 最近对话 — 仅聊天页显示 */}
      {showConversations ? (
        <div className="mt-6 flex flex-1 min-h-0 flex-col">
          <div className="px-5 mb-2">
            <h3 className="text-xs font-semibold text-slate-500 tracking-wide">最近</h3>
          </div>
          <div className="flex-1 overflow-y-auto px-2">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <MessageSquare className="mx-auto mb-1.5 h-6 w-6 text-slate-300" strokeWidth={1.5} />
                <p className="text-xs text-slate-400">暂无对话</p>
              </div>
            ) : (
              <div className="space-y-0.5 pb-2">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => onSelect(conv.id)}
                    className={`group relative w-full rounded-lg px-3 py-2 text-left transition-colors ${
                      activeConversationId === conv.id
                        ? "bg-blue-100 text-blue-900"
                        : "text-slate-700 hover:bg-slate-200/60"
                    }`}
                    title={conv.title}
                  >
                    <p className="truncate text-[13px] leading-tight pr-6">
                      {conv.title}
                    </p>
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span
                        role="button"
                        onClick={(e) => handleDelete(e, conv.id)}
                        className="block rounded p-1 text-slate-400 hover:bg-red-100 hover:text-red-600"
                        title="删除"
                      >
                        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor">
                          <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
                          <path fillRule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                        </svg>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 非聊天页：占位填充以保证用户区贴底 */
        <div className="flex-1" />
      )}

      {/* 用户区 */}
      <div className="border-t border-slate-200/70 p-3">
        <div className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-slate-200/60 transition-colors">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-semibold text-white shadow-sm">
            {user?.username?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-slate-800 truncate">
              {user?.display_name || user?.username}
            </p>
            <p className="text-[11px] text-slate-500 truncate">
              {user?.role === "admin" ? "管理员" : "普通用户"}
            </p>
          </div>
          <button
            onClick={logout}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-300/60 hover:text-slate-700 transition-colors"
            title="退出登录"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

