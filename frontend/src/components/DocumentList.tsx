"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { Document } from "@/types";

interface Props {
  collectionId: string;
}

export default function DocumentList({ collectionId }: Props) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.listDocuments(collectionId);
      setDocuments(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载文档失败");
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    try {
      await api.uploadDocument(collectionId, file);
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除此文档吗？")) return;
    try {
      await api.deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      {/* 上传区域 */}
      <div className="mb-6 rounded-lg border-2 border-dashed border-gray-300 p-6 text-center hover:border-blue-400">
        <label className="cursor-pointer">
          <input
            type="file"
            className="hidden"
            accept=".txt,.pdf,.docx,.md,.html"
            onChange={handleUpload}
            disabled={uploading}
          />
          <div className="flex flex-col items-center gap-2">
            <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-sm text-gray-600">
              {uploading ? "上传中..." : "点击上传文档 (TXT, PDF, DOCX, MD, HTML)"}
            </span>
          </div>
        </label>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* 文档列表 */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          暂无文档，请上传
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {doc.filename}
                </p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(doc.file_size)} · {doc.chunk_count} 个分块 ·{" "}
                  {new Date(doc.created_at).toLocaleString("zh-CN")}
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  doc.status === "completed"
                    ? "bg-green-100 text-green-700"
                    : doc.status === "processing"
                    ? "bg-yellow-100 text-yellow-700"
                    : doc.status === "error"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {doc.status === "completed"
                  ? "已完成"
                  : doc.status === "processing"
                  ? "处理中"
                  : doc.status === "error"
                  ? "失败"
                  : doc.status}
              </span>
              <button
                onClick={() => handleDelete(doc.id)}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                title="删除"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
