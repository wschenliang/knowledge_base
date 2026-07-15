"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePathname, useRouter } from "next/navigation";
import ChatSidebar from "@/components/ConversationList";
import { Menu } from "lucide-react";

/**
 * 全站统一 ChatGPT 风格布局
 *
 * 结构：
 *   ┌──────────┬──────────────────────────────────┐
 *   │          │  (移动端顶部按钮 + 页面标题)        │
 *   │ ChatGPT  ├──────────────────────────────────┤
 *   │ 风格侧栏 │                                  │
 *   │          │         {children 主内容}         │
 *   │          │                                  │
 *   └──────────┴──────────────────────────────────┘
 *
 * - 仅聊天页（pathname=/chat）显示"最近"对话历史
 * - 其他页面只显示品牌、新建、功能导航、用户区
 * - 移动端：点击汉堡按钮可滑出侧栏
 */

interface LayoutProps {
  children: React.ReactNode;
  /** 当前激活的对话 ID（仅聊天页使用） */
  activeConversationId?: string | null;
  /** 选择某个历史对话 */
  onSelectConversation?: (id: string) => void;
  /** 点击"新建对话" */
  onNewConversation?: () => void;
  /** 删除某个对话 */
  onDeleteConversation?: (id: string) => void;
  /** 触发历史列表刷新 */
  refreshKey?: number;
}

export default function Layout({
  children,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  refreshKey,
}: LayoutProps) {
  const { loading, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/");
    }
  }, [loading, isAuthenticated, router]);

  // 切换路由时自动关闭移动端侧栏
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-4 border-slate-200" />
            <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-4 border-transparent border-t-blue-600" />
          </div>
          <p className="text-sm text-slate-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  // 所有页面都显示对话历史（仅聊天页可直接对话，其他页点击历史会跳转 /chat）
  const showConversations = true;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      {/* 移动端遮罩 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 侧边栏：移动端可滑出，桌面端固定 */}
      <div
        className={`fixed inset-y-0 left-0 z-30 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <ChatSidebar
          showConversations={showConversations}
          activeConversationId={activeConversationId ?? null}
          onSelect={(id) => {
            onSelectConversation?.(id);
            // 如果当前不在聊天页，跳转过去加载历史
            if (pathname !== "/chat") {
              router.push("/chat");
            }
            setSidebarOpen(false);
          }}
          onNew={() => {
            onNewConversation?.();
            // 如果当前不在聊天页，跳转过去开启新对话
            if (pathname !== "/chat") {
              router.push("/chat");
            }
            setSidebarOpen(false);
          }}
          onDelete={(id) => {
                      onDeleteConversation?.(id);
                    }}
          onCollapse={() => setSidebarOpen(false)}
          refreshKey={refreshKey}
        />
      </div>

      {/* 主内容区 */}
      <main className="flex flex-1 flex-col min-w-0">
        {/* 移动端顶部条：汉堡 + 当前页面标题 */}
        <div className="flex h-12 items-center gap-3 border-b border-slate-200 px-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
            aria-label="打开侧栏"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-slate-800">
            {getPageTitle(pathname)}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50 lg:bg-white">
          {children}
        </div>
      </main>
    </div>
  );
}

/** 根据路由返回当前页面中文标题 */
function getPageTitle(pathname: string | null): string {
  if (!pathname) return "知识库";
  if (pathname.startsWith("/dashboard")) return "数据概览";
  if (pathname.startsWith("/knowledge-bases")) return "我的知识库";
  if (pathname.startsWith("/search")) return "语义搜索";
  if (pathname.startsWith("/chat")) return "智能问答";
  return "知识库";
}