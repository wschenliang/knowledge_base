"use client";

import { useEffect, useState, useMemo } from "react";
import { X, FileText, AlertCircle, Loader2 } from "lucide-react";
import type { Document } from "@/types";
import { api } from "@/lib/api";
import PdfViewer from "./viewers/PdfViewer";
import DocxViewer from "./viewers/DocxViewer";
import MarkdownViewer from "./viewers/MarkdownViewer";
import HtmlViewer from "./viewers/HtmlViewer";
import TextViewer from "./viewers/TextViewer";

interface PreviewModalProps {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
}

type ViewerType = "pdf" | "docx" | "markdown" | "html" | "text";

function getViewerType(filename: string): ViewerType {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "pdf": return "pdf";
    case "docx": return "docx";
    case "md": return "markdown";
    case "html":
    case "htm": return "html";
    default: return "text";
  }
}

export default function PreviewModal({ document, isOpen, onClose }: PreviewModalProps) {
  const [data, setData] = useState<ArrayBuffer | null>(null);
  const [textContent, setTextContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fallbackMode, setFallbackMode] = useState(false);

  const viewerType = useMemo(() => {
    if (!document) return "text";
    return getViewerType(document.filename);
  }, [document]);

  useEffect(() => {
    if (!isOpen || !document) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    setFallbackMode(false);
    setData(null);
    setTextContent("");

    const loadDocument = async () => {
      try {
        // 对于 text 类型直接走 preview 接口
        if (viewerType === "text") {
          const preview = await api.previewDocument(document.id);
          if (!cancelled) {
            setTextContent(preview.content);
            setLoading(false);
          }
          return;
        }

        // 其他类型先尝试下载原始文件
        const arrayBuffer = await api.downloadDocument(document.id);
        if (!cancelled) {
          setData(arrayBuffer);
          setLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        // 下载失败，尝试纯文本兜底
        try {
          const preview = await api.previewDocument(document.id);
          if (!cancelled) {
            setTextContent(preview.content);
            setFallbackMode(true);
            setLoading(false);
          }
        } catch (fallbackErr) {
          if (cancelled) return;
          console.warn("纯文本兜底也失败:", fallbackErr);
          setError(
            err instanceof Error ? err.message : "加载失败"
          );
          setLoading(false);
        }
      }
    };

    loadDocument();

    return () => { cancelled = true; };
  }, [isOpen, document, viewerType]);

  // ESC 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleEsc);
      window.document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleEsc);
      window.document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen || !document) return null;

  const renderViewer = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3 text-sm text-slate-500">加载文档...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-red-500">
          <AlertCircle className="h-8 w-8 mb-2" />
          <p className="text-sm">{error}</p>
        </div>
      );
    }

    // 兜底模式显示提示
    if (fallbackMode) {
      return (
        <div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm text-amber-700 mb-4">
            原始格式渲染失败，已切换为纯文本预览。
          </div>
          <TextViewer content={textContent} />
        </div>
      );
    }

    switch (viewerType) {
      case "pdf":
        return data ? <PdfViewer data={data} /> : <TextViewer content={textContent} />;
      case "docx":
        return data ? <DocxViewer data={data} /> : <TextViewer content={textContent} />;
      case "markdown":
        return data ? <MarkdownViewer content={new TextDecoder().decode(data)} /> : <TextViewer content={textContent} />;
      case "html":
        return data ? <HtmlViewer content={new TextDecoder().decode(data)} /> : <TextViewer content={textContent} />;
      case "text":
      default:
        return <TextViewer content={textContent} />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* 弹窗 */}
      <div className="relative z-10 w-full max-w-4xl max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col m-4">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 shrink-0">
              <FileText className="h-4 w-4 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 truncate">
                {document.filename}
              </h3>
              <p className="text-xs text-slate-400">
                {viewerType === "pdf" && "PDF 预览"}
                {viewerType === "docx" && "Word 预览"}
                {viewerType === "markdown" && "Markdown 预览"}
                {viewerType === "html" && "HTML 预览"}
                {viewerType === "text" && "文本预览"}
                {fallbackMode && " (纯文本模式)"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-auto min-h-0">
          {renderViewer()}
        </div>
      </div>
    </div>
  );
}