"use client";

import { Tag as TagIcon } from "lucide-react";
import type { Tag } from "@/types";

interface TagFilterProps {
  /** 所有可用标签 */
  tags: Tag[];
  /** 当前选中的标签名称列表 */
  selectedTags: string[];
  /** 选中标签变化回调 */
  onChange: (tagNames: string[]) => void;
}

export default function TagFilter({
  tags,
  selectedTags,
  onChange,
}: TagFilterProps) {
  const toggleTag = (tagName: string) => {
    if (selectedTags.includes(tagName)) {
      onChange(selectedTags.filter((t) => t !== tagName));
    } else {
      onChange([...selectedTags, tagName]);
    }
  };

  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-sm text-slate-500 mr-1">
        <TagIcon className="h-4 w-4" />
        <span>标签:</span>
      </div>
      {tags.map((tag) => {
        const isSelected = selectedTags.includes(tag.name);
        return (
          <button
            key={tag.id}
            onClick={() => toggleTag(tag.name)}
            className={`
              inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium
              transition-all duration-150
              ${
                isSelected
                  ? "text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }
            `}
            style={
              isSelected
                ? { backgroundColor: tag.color || "#6366F1" }
                : undefined
            }
          >
            {tag.name}
            <span
              className={`text-[10px] ${
                isSelected ? "text-white/70" : "text-slate-400"
              }`}
            >
              {tag.collection_count}
            </span>
          </button>
        );
      })}
      {selectedTags.length > 0 && (
        <button
          onClick={() => onChange([])}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors ml-1"
        >
          清除筛选
        </button>
      )}
    </div>
  );
}
