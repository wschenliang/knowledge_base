"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Collection, SearchFacetsResponse, SearchFilters, SearchResult } from "@/types";
import SourceCard from "./SourceCard";
import AdvancedFilterPanel from "./AdvancedFilterPanel";
import { Search, Database, Sparkles, FileSearch, SlidersHorizontal, X } from "lucide-react";

interface Props {
  collections: Collection[];
}

export default function SearchBox({ collections }: Props) {
  const [query, setQuery] = useState("");
  const [selectedCollection, setSelectedCollection] = useState("");
  const [useReranker, setUseReranker] = useState(true);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // 筛选：编辑中 / 已应用 两套状态
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [facets, setFacets] = useState<SearchFacetsResponse | null>(null);
  const [facetsLoading, setFacetsLoading] = useState(false);

  // 切换 KB 时加载 facet（按 collection_id 缓存到 localStorage 5 分钟）
  // setFacets(null) 由 onChange 同步触发，避免 useEffect 内同步 setState
  useEffect(() => {
    if (!selectedCollection) {
      return;
    }
    const cacheKey = `search_facets_${selectedCollection}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { ts, data } = JSON.parse(cached);
        if (Date.now() - ts < 5 * 60 * 1000) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setFacets(data);
          setFacetsLoading(false); // H1: 缓存命中分支也要重置 loading（防止切换 KB 后卡 true）
          return;
        }
      }
    } catch {
      // localStorage 解析失败忽略
    }

    let cancelled = false;
    setFacetsLoading(true);
    api
      .getSearchFacets(selectedCollection)
      .then((data) => {
        if (cancelled) return;
        setFacets(data);
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
        } catch {
          // quota 等忽略
        }
      })
      .catch((err) => {
        console.error("facets load failed:", err);
        if (cancelled) return;
        setFacets({ uploaders: [], tags: [], file_types: [] });
      })
      .finally(() => {
        if (cancelled) return;
        setFacetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCollection]);

  const handleSearch = async () => {
    if (!query.trim() || !selectedCollection) return;

    setLoading(true);
    setSearched(true);
    try {
      const response = await api.search({
        query: query.trim(),
        collection_id: selectedCollection,
        use_reranker: useReranker,
        filters: appliedFilters,
      });
      setResults(response.results);
    } catch (err) {
      console.error("Search error:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  const appliedCount =
    (appliedFilters.file_types?.length || 0) +
    (appliedFilters.uploader_ids?.length || 0) +
    (appliedFilters.tag_ids?.length || 0) +
    (appliedFilters.filename_contains ? 1 : 0);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 搜索控制区 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Database className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <select
              value={selectedCollection}
              onChange={(e) => {
                setSelectedCollection(e.target.value);
                setFacets(null); // 切换 KB 时同步清空旧 facets
                setAppliedFilters({}); // M2: 切换 KB 时一并清空筛选（避免 KB-A 的筛选误带到 KB-B）
              }}
              className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 py-2.5 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 focus:bg-white outline-none transition-all"
            >
              <option value="">选择知识库...</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={useReranker}
              onChange={(e) => setUseReranker(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            重排序
          </label>
          {/* 高级筛选按钮 */}
          <button
            onClick={() => setDrawerOpen(true)}
            disabled={!selectedCollection}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
              appliedCount > 0
                ? "border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100"
                : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            高级
            {appliedCount > 0 && (
              <span className="text-[11px] font-semibold">{appliedCount}</span>
            )}
          </button>
        </div>

        {/* 搜索框 */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={selectedCollection ? "输入搜索关键词..." : "请先选择知识库"}
              disabled={!selectedCollection || loading}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 py-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 focus:bg-white outline-none transition-all disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={!query.trim() || !selectedCollection || loading}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 transition-all"
          >
            <Search className="h-4 w-4" />
            {loading ? "搜索中..." : "搜索"}
          </button>
        </div>

        {/* 已应用筛选摘要 */}
        {appliedCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="text-slate-400">已应用筛选：</span>
            {(appliedFilters.file_types || []).map((ft) => (
              <span key={`ft-${ft}`} className="rounded-full bg-slate-100 px-2 py-0.5">{ft}</span>
            ))}
            {(appliedFilters.uploader_ids || []).map((id) => {
              const label = facets?.uploaders.find((u) => u.value === id)?.label || id;
              return (
                <span key={`u-${id}`} className="rounded-full bg-slate-100 px-2 py-0.5">@{label}</span>
              );
            })}
            {(appliedFilters.tag_ids || []).map((id) => {
              const label = facets?.tags.find((t) => t.value === id)?.label || id;
              return (
                <span key={`t-${id}`} className="rounded-full bg-slate-100 px-2 py-0.5">#{label}</span>
              );
            })}
            {appliedFilters.filename_contains && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5">包含 &quot;{appliedFilters.filename_contains}&quot;</span>
            )}
            <button
              onClick={() => setAppliedFilters({})}
              className="ml-1 flex items-center gap-0.5 text-slate-400 hover:text-slate-700"
            >
              <X className="h-3 w-3" />
              清空
            </button>
          </div>
        )}
      </div>

      {/* 搜索结果 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative mb-3">
              <div className="h-10 w-10 rounded-full border-4 border-slate-200" />
              <div className="absolute inset-0 h-10 w-10 animate-spin rounded-full border-4 border-transparent border-t-blue-600" />
            </div>
            <p className="text-sm text-slate-500">正在检索...</p>
          </div>
        ) : searched ? (
          results.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 mb-3">
                <FileSearch className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700">未找到相关结果</p>
              <p className="mt-1 text-xs text-slate-400">尝试使用不同的关键词或调整筛选条件</p>
            </div>
          ) : (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center gap-2 px-1">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <p className="text-sm text-slate-600">
                  找到 <span className="font-semibold text-slate-900">{results.length}</span> 个相关结果
                </p>
              </div>
              {results.map((result, i) => (
                <SourceCard
                  key={i}
                  source={{
                    index: result.index,
                    source: result.source,
                    text: result.text,
                    score: result.score,
                    file_type: result.file_type,
                    uploader_username: result.uploader_username,
                    tag_ids: result.tag_ids,
                    highlight_terms: result.highlight_terms,
                  }}
                />
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 mb-4">
              <Search className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-600">输入搜索词开始检索</p>
            <p className="mt-1 text-xs text-slate-400">基于向量相似度匹配知识库中的文档片段</p>
            {facetsLoading && (
              <p className="mt-3 text-xs text-slate-400">加载可选筛选维度...</p>
            )}
          </div>
        )}
      </div>

      {/* 抽屉式高级筛选 */}
      <AdvancedFilterPanel
        open={drawerOpen}
        facets={facets}
        initialFilters={appliedFilters}
        appliedCount={appliedCount}
        onApply={(next) => setAppliedFilters(next)}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
