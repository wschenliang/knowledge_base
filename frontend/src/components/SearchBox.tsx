"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Collection, SearchResult } from "@/types";
import SourceCard from "./SourceCard";

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

  const handleSearch = async () => {
    if (!query.trim() || !selectedCollection) return;

    setLoading(true);
    setSearched(true);
    try {
      const response = await api.search({
        query: query.trim(),
        collection_id: selectedCollection,
        use_reranker: useReranker,
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

  return (
    <div className="flex h-full flex-col">
      {/* 搜索控制 */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedCollection}
            onChange={(e) => setSelectedCollection(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">选择知识库...</option>
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={useReranker}
              onChange={(e) => setUseReranker(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            重排序
          </label>
        </div>

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedCollection ? "输入搜索关键词..." : "请先选择知识库"}
            disabled={!selectedCollection || loading}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50"
          />
          <button
            onClick={handleSearch}
            disabled={!query.trim() || !selectedCollection || loading}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "搜索中..." : "搜索"}
          </button>
        </div>
      </div>

      {/* 搜索结果 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-600 border-t-transparent" />
          </div>
        ) : searched ? (
          results.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              未找到相关结果
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                找到 {results.length} 个相关结果
              </p>
              {results.map((result, i) => (
                <SourceCard
                  key={i}
                  source={{
                    index: result.index,
                    source: result.source,
                    text: result.text,
                    score: result.score,
                  }}
                />
              ))}
            </div>
          )
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            输入搜索词开始检索知识库内容
          </div>
        )}
      </div>
    </div>
  );
}
