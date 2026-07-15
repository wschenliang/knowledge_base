"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { Document } from "@/types";
import { Upload, Trash2, CheckCircle, Loader2, AlertCircle, FileText, Clock, HardDrive, Eye } from "lucide-react";
import PreviewModal from "./PreviewModal";

interface Props {
  collectionId: string;
  disabled?: boolean;
}

export default function DocumentList({ collectionId, disabled = false }: Props) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

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
    if (confirm("确定要删除此文档吗？")) {
      try {
        await api.deleteDocument(id);
        setDocuments((prev) => prev.filter((d) => d.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "删除失败");
      }
    }
  };

  const handlePreview = (doc: Document) => {
    setPreviewDoc(doc);
    setIsPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setPreviewDoc(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case "completed":
        return { icon: CheckCircle, label: "已完成", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
      case "processing":
        return { icon: Loader2, label: "处理中", className: "bg-amber-50 text-amber-700 border-amber-200" };
      case "error":
        return { icon: AlertCircle, label: "失败", className: "bg-red-50 text-red-700 border-red-200" };
      default:
        return { icon: Clock, label: status, className: "bg-slate-50 text-slate-600 border-slate-200" };
    }
  };

  return (
    <div>
      {/* 上传区域 */}
      {disabled && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-700 flex items-center gap-2">
          <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
          你当前的角色为 只读访客，无法上传或删除文档。
        </div>
      )}
      <div className={`mb-6 rounded-2xl border-2 border-dashed bg-white p-8 text-center transition-all duration-200 group ${
        disabled
          ? "border-slate-100 opacity-60 cursor-not-allowed"
          : "border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer"
      }`}>
        <label className={disabled ? "cursor-not-allowed" : "cursor-pointer"}>
          <input
            type="file"
            className="hidden"
            accept=".txt,.pdf,.docx,.md,.html"
            onChange={handleUpload}
            disabled={uploading || disabled}
          />
          <div className="flex flex-col items-center gap-3">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-all duration-200 ${
              uploading
                ? "bg-blue-100"
                : disabled
                ? "bg-slate-50"
                : "bg-slate-100 group-hover:bg-blue-100"
            }`}>
              <Upload className={`h-6 w-6 transition-colors ${
                uploading
                  ? "text-blue-600 animate-bounce"
                  : disabled
                  ? "text-slate-300"
                  : "text-slate-400 group-hover:text-blue-600"
              }`} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">
                {uploading ? "正在上传..." : disabled ? "无上传权限" : "点击上传文档"}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                支持 TXT, PDF, DOCX, MD, HTML 格式
              </p>
            </div>
          </div>
        </label>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-100 p-3.5 text-sm text-red-600 flex items-start gap-2">
          <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
          {error}
        </div>
      )}

      {/* 文档列表 */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="relative mb-3">
            <div className="h-8 w-8 rounded-full border-4 border-slate-200" />
            <div className="absolute inset-0 h-8 w-8 animate-spin rounded-full border-4 border-transparent border-t-blue-600" />
          </div>
          <p className="text-sm text-slate-500">加载文档...</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-12">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 mb-3">
            <FileText className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-700">暂无文档</p>
          <p className="mt-1 text-xs text-slate-400">上传文档以开始构建知识库</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {/* 表头 */}
          <div className="grid grid-cols-12 gap-4 border-b border-slate-100 bg-slate-50/80 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <div className="col-span-5">文件名</div>
            <div className="col-span-2">大小</div>
            <div className="col-span-2">分块</div>
            <div className="col-span-2">状态</div>
            <div className="col-span-1 text-right">操作</div>
          </div>

          {/* 文档行 */}
          <div className="divide-y divide-slate-100">
            {documents.map((doc) => {
              const statusInfo = getStatusInfo(doc.status);
              const StatusIcon = statusInfo.icon;
              return (
                <div
                  key={doc.id}
                  className="grid grid-cols-12 gap-4 items-center px-5 py-3.5 hover:bg-slate-50/50 transition-colors group"
                >
                  <div className="col-span-5 flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 shrink-0">
                      <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{doc.filename}</p>
                      <p className="text-xs text-slate-400">
                        {new Date(doc.created_at).toLocaleString("zh-CN")}
                      </p>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                      <HardDrive className="h-3 w-3 text-slate-400" />
                      {formatFileSize(doc.file_size)}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-slate-500">{doc.chunk_count} 个分块</span>
                  </div>
                  <div className="col-span-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${statusInfo.className}`}>
                      <StatusIcon className={`h-3 w-3 ${status === "processing" ? "animate-spin" : ""}`} />
                      {statusInfo.label}
                    </span>
                  </div>
                  <div className="col-span-1 flex justify-end gap-1">
                    <button
                      onClick={() => handlePreview(doc)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all"
                      title="预览"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {!disabled && (
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <PreviewModal
        document={previewDoc}
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
      />
    </div>
  );
}
