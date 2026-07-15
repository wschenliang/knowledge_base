"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Layout from "@/components/Layout";
import DocumentList from "@/components/DocumentList";
import CollectionMemberManager from "@/components/CollectionMemberManager";
import RoleBadge from "@/components/RoleBadge";
import { canEdit } from "@/lib/permissions";
import type { Collection, AclRole } from "@/types";
import { ChevronRight, FileText, Calendar, Database, Home } from "lucide-react";
import Link from "next/link";

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "members">("overview");

  useEffect(() => {
    if (!authLoading && isAuthenticated && id) {
      api
        .getCollection(id)
        .then(setCollection)
        .catch((err) => setError(err instanceof Error ? err.message : "加载失败"))
        .finally(() => setLoading(false));
    }
  }, [authLoading, isAuthenticated, id]);

  if (authLoading) return null;

  const myRole = collection?.my_role as AclRole | undefined;

  return (
    <Layout>
      <div className="mx-auto max-w-5xl">
        {/* 面包屑导航 */}
        <nav className="mb-4 flex items-center gap-1.5 text-sm text-slate-500">
          <Link href="/dashboard" className="flex items-center gap-1 hover:text-blue-600 transition-colors">
            <Home className="h-3.5 w-3.5" />
            <span>知识库</span>
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
          <span className="text-slate-900 font-medium truncate">
            {loading ? "加载中..." : collection?.name}
          </span>
        </nav>

        {/* 头部 */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative mb-3">
              <div className="h-10 w-10 rounded-full border-4 border-slate-200" />
              <div className="absolute inset-0 h-10 w-10 animate-spin rounded-full border-4 border-transparent border-t-blue-600" />
            </div>
            <p className="text-sm text-slate-500">加载知识库...</p>
          </div>
        ) : error ? (
          <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600 flex items-start gap-2">
            <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
            {error}
          </div>
        ) : collection ? (
          <>
            {/* 知识库信息卡片 */}
            <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20 shrink-0">
                  <Database className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-bold text-slate-900">{collection.name}</h1>
                    {myRole && <RoleBadge role={myRole} size="sm" />}
                  </div>
                  {collection.description && (
                    <p className="mt-1 text-sm text-slate-500 leading-relaxed">{collection.description}</p>
                  )}
                </div>
              </div>

              {/* 统计信息 */}
              <div className="mt-5 grid grid-cols-3 gap-4 pt-5 border-t border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                    <FileText className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-slate-900">{collection.document_count}</p>
                    <p className="text-xs text-slate-500">文档</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                    <Calendar className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {new Date(collection.created_at).toLocaleDateString("zh-CN")}
                    </p>
                    <p className="text-xs text-slate-500">创建时间</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
                    <Database className="h-4 w-4 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 truncate">{collection.id.slice(0, 8)}</p>
                    <p className="text-xs text-slate-500">ID</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tab 切换 */}
            <div className="mb-6 border-b border-slate-200">
              <nav className="flex gap-6">
                <button
                  onClick={() => setTab("overview")}
                  className={`relative pb-3 text-sm font-medium transition-colors ${
                    tab === "overview"
                      ? "text-blue-600"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  概览
                  {tab === "overview" && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                </button>
                <button
                  onClick={() => setTab("members")}
                  className={`relative pb-3 text-sm font-medium transition-colors ${
                    tab === "members"
                      ? "text-blue-600"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  成员
                  {tab === "members" && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                </button>
              </nav>
            </div>

            {tab === "overview" && (
              <DocumentList collectionId={id} disabled={!canEdit(myRole)} />
            )}
            {tab === "members" && (
              <CollectionMemberManager collectionId={id} myRole={myRole} />
            )}
          </>
        ) : null}
      </div>
    </Layout>
  );
}
