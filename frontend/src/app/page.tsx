import LandingNav from "@/components/landing/LandingNav";
import LandingHero from "@/components/landing/LandingHero";
import LandingFeatures from "@/components/landing/LandingFeatures";
import LandingCTA from "@/components/landing/LandingCTA";
import LandingFooter from "@/components/landing/LandingFooter";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CogniBase - 企业级智能知识库",
  description: "基于 RAG 技术的企业级知识库平台，智能文档管理、语义搜索与 AI 问答，一站式解决企业知识沉淀与流转难题。",
};

/**
 * 主页（根路由 /）
 * - 未登录用户：展示产品介绍 Landing Page
 * - 已登录用户：由 RequireGuest 守卫自动跳 /dashboard（暂不引入，保持简洁）
 *
 * 结构：固定导航 → Hero → 功能特性 → CTA → 页脚
 */
export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      <LandingNav />
      <LandingHero />
      <LandingFeatures />
      <LandingCTA />
      <LandingFooter />
    </main>
  );
}
