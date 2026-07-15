"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import mammoth from "mammoth";

interface DocxViewerProps {
  data: ArrayBuffer;
}

export default function DocxViewer({ data }: DocxViewerProps) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    mammoth.convertToHtml({ arrayBuffer: data })
      .then((result) => {
        if (cancelled) return;
        setHtml(result.value);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError("DOCX 加载失败: " + (err.message || "未知错误"));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-sm text-slate-500">加载 DOCX...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-red-500 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div
      className="prose prose-slate max-w-none p-4"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}