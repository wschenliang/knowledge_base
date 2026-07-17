"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, FileText, User, Tag as TagIcon, Type, ChevronDown, Check, Filter } from "lucide-react";
import type { SearchFilters, SearchFacetsResponse, FacetOption } from "@/types";

interface Props {
  open: boolean;
  facets: SearchFacetsResponse | null;
  /** 当前"编辑中"的筛选条件（用于抽屉内 checkbox / 多选下拉的初始值） */
  initialFilters: SearchFilters;
  /** 已应用筛选数量（用于标题旁徽章） */
  appliedCount: number;
  onApply: (filters: SearchFilters) => void;
  onClose: () => void;
}

const FILE_TYPE_LABEL: Record<string, string> = {
  pdf: "PDF",
  docx: "Word",
  doc: "Word",
  md: "Markdown",
  txt: "Text",
  xlsx: "Excel",
  xls: "Excel",
  pptx: "PowerPoint",
  ppt: "PowerPoint",
  html: "HTML",
  csv: "CSV",
};

export default function AdvancedFilterPanel({
  open,
  facets,
  initialFilters,
  appliedCount,
  onApply,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<SearchFilters>(initialFilters);
  const [mounted, setMounted] = useState(false);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);

  // 打开时把 initialFilters 拷贝到 draft
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(initialFilters);
    }
  }, [open, initialFilters]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 打开时锁定 body 滚动
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open || !mounted) return null;

  const toggleFileType = (v: string) => {
    const cur = draft.file_types || [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    setDraft({ ...draft, file_types: next.length ? next : undefined });
  };

  const toggleId = (key: "uploader_ids" | "tag_ids", v: string) => {
    const cur = (draft[key] || []) as string[];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    setDraft({ ...draft, [key]: next.length ? next : undefined });
  };

  const handleClear = () => {
    setDraft({});
  };

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  const draftCount =
    (draft.file_types?.length || 0) +
    (draft.uploader_ids?.length || 0) +
    (draft.tag_ids?.length || 0) +
    (draft.filename_contains ? 1 : 0);

  const fileTypeOptions: FacetOption[] = facets?.file_types || [];
  const uploaderOptions: FacetOption[] = facets?.uploaders || [];
  const tagOptions: FacetOption[] = facets?.tags || [];

  return createPortal(
    <div
      className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-[1px] flex justify-end"
      onClick={onClose}
    >
      <div
        className="w-[380px] max-w-[92vw] h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-600" />
            <h2 className="text-sm font-semibold text-slate-900">高级筛选</h2>
            {appliedCount > 0 && (
              <span className="text-[11px] font-medium text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">
                已应用 {appliedCount} 项
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* 文件类型 */}
          <section>
            <div className="flex items-center gap-1.5 mb-2.5">
              <FileText className="h-3.5 w-3.5 text-slate-500" />
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">文件类型</h3>
            </div>
            {fileTypeOptions.length === 0 ? (
              <p className="text-xs text-slate-400">暂无选项</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {fileTypeOptions.map((opt) => {
                  const checked = draft.file_types?.includes(opt.value) || false;
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs cursor-pointer transition-all ${
                        checked
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => toggleFileType(opt.value)}
                      />
                      <Check
                        className={`h-3 w-3 ${checked ? "opacity-100" : "opacity-0"}`}
                      />
                      <span>{FILE_TYPE_LABEL[opt.value] || opt.label}</span>
                      <span className="text-slate-400">({opt.count})</span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          {/* 上传者 */}
          <section>
            <div className="flex items-center gap-1.5 mb-2.5">
              <User className="h-3.5 w-3.5 text-slate-500" />
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">上传者</h3>
            </div>
            {uploaderOptions.length === 0 ? (
              <p className="text-xs text-slate-400">暂无选项</p>
            ) : (
              <MultiSelectDropdown
                options={uploaderOptions}
                selected={draft.uploader_ids || []}
                onToggle={(v) => toggleId("uploader_ids", v)}
                open={uploaderOpen}
                setOpen={setUploaderOpen}
                placeholder="选择上传者..."
              />
            )}
          </section>

          {/* 知识库标签 */}
          <section>
            <div className="flex items-center gap-1.5 mb-2.5">
              <TagIcon className="h-3.5 w-3.5 text-slate-500" />
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">知识库标签</h3>
            </div>
            {tagOptions.length === 0 ? (
              <p className="text-xs text-slate-400">暂无选项</p>
            ) : (
              <MultiSelectDropdown
                options={tagOptions}
                selected={draft.tag_ids || []}
                onToggle={(v) => toggleId("tag_ids", v)}
                open={tagOpen}
                setOpen={setTagOpen}
                placeholder="选择标签..."
              />
            )}
          </section>

          {/* 文件名包含 */}
          <section>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Type className="h-3.5 w-3.5 text-slate-500" />
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">文件名包含</h3>
            </div>
            <input
              type="text"
              value={draft.filename_contains || ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  filename_contains: e.target.value.trim() || undefined,
                })
              }
              placeholder="输入关键字，如 监控"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 focus:bg-white outline-none"
            />
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={handleClear}
            disabled={draftCount === 0}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            清空
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={draftCount === 0}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            应用筛选 {draftCount > 0 && `(${draftCount})`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ===== 内嵌子组件：多选下拉 ===== */

interface MultiSelectProps {
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  placeholder: string;
}

function MultiSelectDropdown({
  options,
  selected,
  onToggle,
  open,
  setOpen,
  placeholder,
}: MultiSelectProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, setOpen]);

  const labels = options
    .filter((o) => selected.includes(o.value))
    .map((o) => o.label)
    .join("、");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:border-slate-300"
      >
        <span className={selected.length === 0 ? "text-slate-400" : "truncate"}>
          {selected.length === 0 ? placeholder : labels}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-60 overflow-y-auto">
          {options.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                  checked={checked}
                  onChange={() => onToggle(opt.value)}
                />
                <span className="flex-1 truncate text-slate-700">{opt.label}</span>
                <span className="text-xs text-slate-400">{opt.count}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}