"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Layout from "@/components/Layout";
import DocumentList from "@/components/DocumentList";
import type { Collection } from "@/types";

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <Layout>
      <div className="mx-auto max-w-4xl">
        {/* 头部 */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-600 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="rounded-md bg-red-50 p-4 text-sm text-red-600">{error}</div>
        ) : collection ? (
          <>
            <div className="mb-6">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{collection.name}</h1>
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                  {collection.document_count} 个文档
                </span>
              </div>
              {collection.description && (
                <p className="mt-1 text-sm text-gray-500">{collection.description}</p>
              )}
              <p className="mt-1 text-xs text-gray-400">
                创建于 {new Date(collection.created_at).toLocaleString("zh-CN")}
              </p>
            </div>

            {/* 文档管理 */}
            <DocumentList collectionId={id} />
          </>
        ) : null}
      </div>
    </Layout>
  );
}
