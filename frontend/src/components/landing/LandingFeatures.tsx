"use client";

import { BookOpen, Search, MessageSquare, Shield, Zap, BarChart3 } from "lucide-react";

interface FeatureCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  /** 卡片渐变背景色 */
  gradient: string;
  /** 图标背景色 */
  iconBg: string;
  /** 图标颜色 */
  iconColor: string;
}

function FeatureCard({ icon: Icon, title, desc, gradient, iconBg, iconColor }: FeatureCardProps) {
  return (
    <div className="group relative rounded-2xl border border-slate-100 bg-white p-6 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
      {/* 顶部装饰条 */}
      <div className={`absolute top-0 left-4 right-4 h-1 rounded-b-full ${gradient} opacity-60 group-hover:opacity-100 transition-opacity`} />

      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconBg} mb-4`}>
        <Icon className={`h-5.5 w-5.5 ${iconColor}`} />
      </div>
      <h3 className="text-base font-semibold text-slate-900 mb-1.5">{title}</h3>
      <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
    </div>
  );
}

/**
 * 功能特性区 — 6 张卡片，2 行 3 列
 */
export default function LandingFeatures() {
  const features: FeatureCardProps[] = [
    {
      icon: BookOpen,
      title: "智能文档管理",
      desc: "支持 Markdown、PDF、Word、TXT 等多种格式，自动解析与智能分块。",
      gradient: "bg-gradient-to-r from-blue-400 to-indigo-500",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      icon: Search,
      title: "语义搜索",
      desc: "基于向量相似度的智能检索，精准匹配用户意图，秒级返回结果。",
      gradient: "bg-gradient-to-r from-emerald-400 to-teal-500",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
    },
    {
      icon: MessageSquare,
      title: "AI 智能问答",
      desc: "基于 RAG 技术，结合知识库上下文，提供精准、可追溯的 AI 回答。",
      gradient: "bg-gradient-to-r from-amber-400 to-orange-500",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
    },
    {
      icon: Shield,
      title: "细粒度权限控制",
      desc: "支持拥有者、编辑者、查看者三级角色，确保知识安全可控。",
      gradient: "bg-gradient-to-r from-violet-400 to-purple-500",
      iconBg: "bg-violet-50",
      iconColor: "text-violet-600",
    },
    {
      icon: Zap,
      title: "流式实时响应",
      desc: "SSE 流式输出，AI 回答逐字呈现，告别等待，体验如丝般顺滑。",
      gradient: "bg-gradient-to-r from-rose-400 to-pink-500",
      iconBg: "bg-rose-50",
      iconColor: "text-rose-600",
    },
    {
      icon: BarChart3,
      title: "数据洞察",
      desc: "Dashboard 统计问答热度、高频问题、活跃知识库，数据驱动运营。",
      gradient: "bg-gradient-to-r from-cyan-400 to-sky-500",
      iconBg: "bg-cyan-50",
      iconColor: "text-cyan-600",
    },
  ];

  return (
    <section className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* 区块标题 */}
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight mb-4">
            核心功能
          </h2>
          <p className="mx-auto max-w-xl text-base text-slate-500">
            从文档上传到智能问答，全链路覆盖企业知识管理场景
          </p>
        </div>

        {/* 卡片网格 */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </div>
    </section>
  );
}
