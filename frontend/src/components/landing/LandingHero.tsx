"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * Hero 区域
 * - 大标题：部分字符用彩色渐变（参考样例图片"我们帮你够到那颗糖"）
 * - 副标题 + CTA 按钮 + 次级链接
 */
export default function LandingHero() {
  return (
    <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28">
      {/* 背景装饰：极淡的径向渐变 */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-gradient-to-b from-blue-50/60 to-transparent blur-3xl pointer-events-none" />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 text-center">
        {/* 小标签 */}
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/50 px-4 py-1.5 text-xs font-medium text-blue-700 mb-8">
          <Sparkles className="h-3.5 w-3.5" />
          基于 RAG 技术的企业级知识库
        </div>

        {/* 大标题 — 部分字符彩色渐变 */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.1] mb-6">
          让{" "}
          <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            知识
          </span>{" "}
          驱动
          <br className="hidden sm:block" />
          每一个{" "}
          <span className="bg-gradient-to-r from-emerald-500 to-teal-600 bg-clip-text text-transparent">
            业务决策
          </span>
        </h1>

        {/* 副标题 */}
        <p className="mx-auto max-w-2xl text-base sm:text-lg text-slate-500 leading-relaxed mb-10">
          智能文档管理、语义搜索与 AI 问答，一站式解决企业知识沉淀与流转难题。
          让团队随时随地获取精准答案。
        </p>

        {/* CTA 按钮组 */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 hover:bg-slate-800 hover:shadow-xl hover:shadow-slate-900/15 transition-all"
          >
            立即开始
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-7 py-3 text-sm font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 transition-colors"
          >
            已有账号？登录
          </Link>
        </div>
      </div>
    </section>
  );
}
