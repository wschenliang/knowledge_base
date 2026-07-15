"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Layout from "@/components/Layout";
import SearchBox from "@/components/SearchBox";
import type { Collection } from "@/types";
import { Search } from "lucide-react";

export default function SearchPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCollections = useCallback(async () => {
    try {
      const result = await api.listCollections();
      setCollections(result.items);
    } catch (err) {
      console.error("Failed to load collections:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadCollections();
    }
  }, [authLoading, isAuthenticated, loadCollections]);

  if (authLoading) return null;

  return (
    <Layout>
      <div className="mx-auto flex h-full max-w-4xl flex-col">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
            <Search className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">语义搜索</h1>
            <p className="text-sm text-slate-500">基于向量相似度的智能文档检索</p>
          </div>
        </div>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative mb-3">
              <div className="h-10 w-10 rounded-full border-4 border-slate-200" />
              <div className="absolute inset-0 h-10 w-10 animate-spin rounded-full border-4 border-transparent border-t-blue-600" />
            </div>
            <p className="text-sm text-slate-500">加载知识库...</p>
          </div>
        ) : (
          <SearchBox collections={collections} />
        )}
      </div>
    </Layout>
  );
}
