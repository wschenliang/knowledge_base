"use client";

import { useState } from "react";
import type { SourceItem } from "@/types";
import HighlightedText from "./HighlightedText";
import { FILE_TYPE_LABEL, fileTypeChipClass } from "@/lib/fileTypes";
import {
  FileText,
  FileType,
  ChevronDown,
  ChevronUp,
  User,
} from "lucide-react";

interface Props {
  source: SourceItem;
}

export default function SourceCard({ source }: Props) {
  const [expanded, setExpanded] = useState(false);
  const scorePercent = Math.round(source.score * 100);

  // 根据分数决定颜色
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return "bg-emerald-500";
    if (score >= 0.6) return "bg-blue-500";
    if (score >= 0.4) return "bg-amber-500";
    return "bg-slate-400";
  };

  const getBorderColor = (score: number) => {
    if (score >= 0.8) return "border-l-emerald-500";
    if (score >= 0.6) return "border-l-blue-500";
    if (score >= 0.4) return "border-l-amber-500";
    return "border-l-slate-400";
  };

  const highlightTerms = source.highlight_terms;

  return (
    <div className={`rounded-xl border border-slate-200 bg-white border-l-[3px] ${getBorderColor(source.score)} shadow-sm overflow-hidden transition-all hover:shadow-md`}>
      <div className="p-4">
        {/* 头部信息 */}
        <div className="flex items-center gap-3 mb-2.5">
          <span className="inline-flex items-center justify-center h-6 min-w-[24px] rounded-md bg-slate-100 px-1.5 text-xs font-bold text-slate-600">
            #{source.index + 1}
          </span>
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="text-xs font-medium text-slate-600 truncate">
              {source.source}
            </span>
          </div>
          {/* 相关度 */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${getScoreColor(source.score)} transition-all`}
                style={{ width: `${scorePercent}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-slate-500 tabular-nums">
              {scorePercent}%
            </span>
          </div>
        </div>

        {/* 元信息行：文件类型 + 上传者 */}
        {(source.file_type || source.uploader_username) && (
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            {source.file_type && (
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${fileTypeChipClass(source.file_type)}`}
                title={`文件类型: ${source.file_type}`}
              >
                <FileType className="h-3 w-3" />
                {FILE_TYPE_LABEL[source.file_type] || source.file_type.toUpperCase()}
              </span>
            )}
            {source.uploader_username && (
              <span
                className="inline-flex items-center gap-1 text-[11px] text-slate-500"
                title={`上传者: ${source.uploader_username}`}
              >
                <User className="h-3 w-3" />
                {source.uploader_username}
              </span>
            )}
          </div>
        )}

        {/* 文本内容（BM25 命中词高亮） */}
        <div className="relative">
          <div className={`text-sm text-slate-700 leading-relaxed ${expanded ? "" : "line-clamp-3"}`}>
            <HighlightedText text={source.text} terms={highlightTerms} />
          </div>
          {source.text.length > 150 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              {expanded ? (
                <>收起 <ChevronUp className="h-3 w-3" /></>
              ) : (
                <>展开全部 <ChevronDown className="h-3 w-3" /></>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}