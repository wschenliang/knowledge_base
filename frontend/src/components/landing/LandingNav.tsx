"use client";

import Link from "next/link";
import { Database, LogIn, ArrowRight } from "lucide-react";

/**
 * 顶部导航栏
 * - 左侧：Logo + 品牌名
 * - 右侧：登录 / 注册按钮
 */
export default function LandingNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/15 transition-transform group-hover:scale-105">
              <Database className="h-5 w-5 text-white" strokeWidth={2.2} />
            </div>
            <span className="text-lg font-bold text-slate-900 tracking-tight">
              CogniBase
            </span>
          </Link>

          {/* 右侧操作区 */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            >
              <LogIn className="h-4 w-4" />
              登录
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
            >
              注册
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
