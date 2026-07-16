"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Layout from "@/components/Layout";
import FavoriteCard from "@/components/FavoriteCard";
import type { FavoriteItem, Collection } from "@/types";
import { Heart, Search, Filter } from "lucide-react";

export default function FavoritesPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedCollection, setSelectedCollection] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const loadCollections = useCallback(async () => {
    try {
      const result = await api.listCollections();
      setCollections(result.items);
    } catch {
      // ignore
    }
  }, []);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.listFavorites({
        collection_id: selectedCollection || undefined,
        keyword: keyword || undefined,
        skip: page * pageSize,
        limit: pageSize,
      });
      setFavorites(result.items);
      setTotal(result.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [keyword, selectedCollection, page]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadCollections();
      loadFavorites();
    }
  }, [authLoading, isAuthenticated, loadFavorites, loadCollections]);

  const handleSearch = () => {
    setKeyword(searchInput);
    setPage(0);
  };

  const handleRemoved = (messageId: string) => {
    setFavorites((prev) => prev.filter((f) => f.message_id !== messageId));
    setTotal((prev) => prev - 1);
  };

  const totalPages = Math.ceil(total / pageSize);

  if (authLoading) return null;

  return (
    <Layout>
      <div className="mx-auto w-full max-w-4xl px-6 py-8">
        {/* 页面标题 */}
        <div className="mb-6 flex items-center gap-3">
          <Heart className="h-6 w-6 text-rose-500" fill="currentColor" />
          <h1 className="text-2xl font-bold text-slate-900">我的收藏</h1>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            {total} 条
          </span>
        </div>

        {/* 筛选栏 */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* 搜索框 */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="搜索收藏内容或备注..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            />
          </div>
          {/* 知识库筛选 */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              value={selectedCollection}
              onChange={(e) => { setSelectedCollection(e.target.value); setPage(0); }}
              className="appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            >
              <option value="">全部知识库</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 收藏列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="h-10 w-10 rounded-full border-4 border-slate-200" />
                <div className="absolute inset-0 h-10 w-10 animate-spin rounded-full border-4 border-transparent border-t-blue-600" />
              </div>
              <p className="text-sm text-slate-500">加载中...</p>
            </div>
          </div>
        ) : favorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Heart className="mb-3 h-12 w-12 text-slate-200" />
            <p className="text-sm text-slate-500">
              {keyword || selectedCollection ? "没有找到匹配的收藏" : "还没有收藏任何问答"}
            </p>
            {!keyword && !selectedCollection && (
              <p className="mt-1 text-xs text-slate-400">
                在智能问答中点击 AI 回复下方的心形图标即可收藏
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {favorites.map((item) => (
                <FavoriteCard key={item.id} item={item} onRemoved={handleRemoved} />
              ))}
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  上一页
                </button>
                <span className="text-sm text-slate-500">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
