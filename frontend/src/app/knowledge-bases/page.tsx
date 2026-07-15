"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import CollectionCard from "@/components/CollectionCard";
import type { Collection } from "@/types";
import { Plus, Database, FileText, X, FolderOpen } from "lucide-react";

export default function KnowledgeBasesPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [error, setError] = useState("");

  const loadCollections = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.listCollections();
      setCollections(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载知识库失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadCollections();
    }
  }, [authLoading, isAuthenticated, loadCollections]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setError("");
    try {
      await api.createCollection(newName.trim(), newDesc.trim() || undefined);
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      await loadCollections();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    }
  };

  if (authLoading) return null;

  const totalDocs = collections.reduce((sum, c) => sum + c.document_count, 0);

  return (
    <Layout>
      <div className="mx-auto max-w-6xl">
        {/* 页面头部 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">我的知识库</h1>
          <p className="mt-1 text-sm text-slate-500">管理和组织您的文档知识库</p>
        </div>

        {/* 统计概览 */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                <Database className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{collections.length}</p>
                <p className="text-xs text-slate-500">知识库</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                <FileText className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{totalDocs}</p>
                <p className="text-xs text-slate-500">文档总数</p>
              </div>
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100/60">
                <Plus className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <button
                  onClick={() => setShowCreate(true)}
                  className="text-sm font-semibold text-blue-700 hover:text-blue-800 transition-colors"
                >
                  新建知识库
                </button>
                <p className="text-xs text-blue-600/60">快速创建</p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-100 p-3.5 text-sm text-red-600 flex items-start gap-2">
            <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
            {error}
          </div>
        )}

        {/* 知识库列表 */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative mb-3">
              <div className="h-10 w-10 rounded-full border-4 border-slate-200" />
              <div className="absolute inset-0 h-10 w-10 animate-spin rounded-full border-4 border-transparent border-t-blue-600" />
            </div>
            <p className="text-sm text-slate-500">加载知识库...</p>
          </div>
        ) : collections.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 px-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 mb-4">
              <FolderOpen className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">还没有知识库</h3>
            <p className="text-sm text-slate-500 mb-4">创建您的第一个知识库，开始管理文档</p>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              新建知识库
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((c) => (
              <CollectionCard key={c.id} collection={c} />
            ))}
          </div>
        )}
      </div>

      {/* 创建弹窗 - 模态对话框 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">新建知识库</h2>
                <p className="text-sm text-slate-500">创建一个新的文档知识库</p>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">名称</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
                  placeholder="输入知识库名称"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">描述</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={3}
                  className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all resize-none"
                  placeholder="可选，描述知识库用途"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  创建
                </button>
                <button
                  onClick={() => {
                    setShowCreate(false);
                    setNewName("");
                    setNewDesc("");
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
