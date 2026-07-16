"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

interface RequireGuestProps {
  children: ReactNode;
  /** 已登录用户访问时跳转目标，默认为 /dashboard */
  fallback?: string;
}

/**
 * 页面级守卫：仅在未登录状态下渲染 children
 * - 加载中：渲染 loading 占位
 * - 已登录：跳转到 fallback（默认 /dashboard），防止已登录用户访问 /login、/register
 *
 * 用法（在 /login、/register 页面）：
 *   <RequireGuest>
 *     <LoginForm mode="login" />
 *   </RequireGuest>
 */
export default function RequireGuest({ children, fallback = "/dashboard" }: RequireGuestProps) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace(fallback);
    }
  }, [loading, isAuthenticated, router, fallback]);

  if (loading || isAuthenticated) {
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

  return <>{children}</>;
}