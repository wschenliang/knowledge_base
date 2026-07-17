/**
 * 文件类型展示标签（与后端 schemas/document.py / Qdrant payload 中的 file_type 字段对齐）
 *
 * 抽出来作为共享常量，避免在 AdvancedFilterPanel / SourceCard 等多个组件重复定义。
 */

export const FILE_TYPE_LABEL: Record<string, string> = {
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

/**
 * 根据文件类型返回 chip 颜色（用于 SourceCard 元信息行）
 */
export function fileTypeChipClass(fileType?: string | null): string {
  switch (fileType) {
    case "pdf":
      return "bg-red-50 text-red-700 border-red-200";
    case "docx":
    case "doc":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "xlsx":
    case "xls":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "pptx":
    case "ppt":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "md":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "txt":
    case "csv":
      return "bg-slate-50 text-slate-700 border-slate-200";
    case "html":
      return "bg-orange-50 text-orange-700 border-orange-200";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}