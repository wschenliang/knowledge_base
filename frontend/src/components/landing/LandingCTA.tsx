"use client";

import Link from "next/link";
import { ArrowRight, Database } from "lucide-react";

/**
 * 底部 CTA 区域
 * - 深色背景 + 居中号召
 */
export default function LandingCTA() {
  return (
    <section className="relative py-20 sm:py-28 overflow-hidden">
      {/* 背景 */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[400px] w-[600px] rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />

      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 mb-6">
          <Database className="h-6 w-6 text-white" />
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
          准备好提升团队效率了吗？
        </h2>
        <p className="text-base sm:text-lg text-slate-300 leading-relaxed mb-10 max-w-xl mx-auto">
          立即注册，免费体验企业级知识库管理。无需信用卡，即刻开始。
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3 text-sm font-semibold text-slate-900 shadow-lg hover:bg-slate-50 transition-colors"
          >
            免费开始使用
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-7 py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors"
          >
            登录已有账号
          </Link>
        </div>
      </div>
    </section>
  );
}
