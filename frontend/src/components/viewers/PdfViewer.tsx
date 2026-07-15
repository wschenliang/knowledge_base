"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

// 设置 PDF.js worker
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

interface PdfViewerProps {
  data: ArrayBuffer;
}

export default function PdfViewer({ data }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    pdfjsLib.getDocument({ data }).promise
      .then((loadedPdf) => {
        if (cancelled) return;
        setPdf(loadedPdf);
        setNumPages(loadedPdf.numPages);
        setPageNum(1);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError("PDF 加载失败: " + (err.message || "未知错误"));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [data]);

  const renderPage = useCallback(async () => {
    if (!pdf || !canvasRef.current) return;

    const page = await pdf.getPage(pageNum);
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    const viewport = page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport, canvas: canvasRef.current }).promise;
  }, [pdf, pageNum, scale]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  const goToPrev = () => setPageNum((p) => Math.max(1, p - 1));
  const goToNext = () => setPageNum((p) => Math.min(numPages, p + 1));
  const zoomIn = () => setScale((s) => Math.min(3, s + 0.2));
  const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.2));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-sm text-slate-500">加载 PDF...</span>
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
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={goToPrev} disabled={pageNum <= 1} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm text-slate-600">
          第 {pageNum} / {numPages} 页
        </span>
        <button onClick={goToNext} disabled={pageNum >= numPages} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
        <div className="w-px h-4 bg-slate-200 mx-1" />
        <button onClick={zoomOut} className="p-1.5 rounded-lg hover:bg-slate-100">
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="text-xs text-slate-500">{Math.round(scale * 100)}%</span>
        <button onClick={zoomIn} className="p-1.5 rounded-lg hover:bg-slate-100">
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>
      <canvas ref={canvasRef} className="shadow-lg rounded-lg" />
    </div>
  );
}
