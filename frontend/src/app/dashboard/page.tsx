"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Layout from "@/components/Layout";
import type { DashboardStats } from "@/types";
import { AlertCircle } from "lucide-react";

import DashboardHeader from "@/components/dashboard/DashboardHeader";
import RangeSelector from "@/components/dashboard/RangeSelector";
import KpiCards from "@/components/dashboard/KpiCards";
import TrendChart from "@/components/dashboard/TrendChart";
import TopCollections from "@/components/dashboard/TopCollections";
import TopUsers from "@/components/dashboard/TopUsers";
import TopQuestions from "@/components/dashboard/TopQuestions";
import DashboardSkeleton from "@/components/dashboard/DashboardSkeleton";

export default function DashboardPage() {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStats = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError("");
      const data = await api.getDashboardStats(days);
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadStats();
    }
  }, [authLoading, isAuthenticated, loadStats]);

  if (authLoading) return null;

  const isAdmin = user?.role === "admin";

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <DashboardHeader
          scope={stats?.scope || (isAdmin ? "admin" : "user")}
          rangeDays={days}
          onRefresh={() => loadStats(false)}
          loading={loading && !!stats}
        />

        <div className="mb-6">
          <RangeSelector value={days} onChange={setDays} />
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-100 p-3.5 text-sm text-red-600 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
            <button
              onClick={() => loadStats()}
              className="ml-auto text-xs font-medium text-red-700 hover:underline"
            >
              重试
            </button>
          </div>
        )}

        {loading && !stats ? (
          <DashboardSkeleton />
        ) : stats ? (
          <div className="space-y-6">
            <KpiCards kpi={stats.kpi} scope={stats.scope} />

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <TrendChart trends={stats.trends} showDocuments={stats.scope === "admin"} />
              </div>
              <TopCollections items={stats.top_collections} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {stats.scope === "admin" && stats.top_users && (
                <TopUsers items={stats.top_users} />
              )}
              {stats.scope === "user" && (
                <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 shadow-sm flex flex-col items-center justify-center text-center">
                  <div className="text-3xl mb-2">📊</div>
                  <p className="text-sm font-medium text-slate-700">
                    你贡献了 {stats.kpi.total_messages} 条问答消息
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    继续保持，知识库会越来越丰富
                  </p>
                </div>
              )}
              <TopQuestions items={stats.top_questions} />
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}