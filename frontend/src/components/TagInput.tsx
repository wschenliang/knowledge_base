"use client";

import { useState, useRef, useEffect } from "react";
import { X, Plus } from "lucide-react";
import type { Tag } from "@/types";

interface TagInputProps {
  /** 当前选中的标签 ID 列表 */
  value: string[];
  /** 选中标签变化回调 */
  onChange: (tagIds: string[]) => void;
  /** 所有可用标签 */
  availableTags: Tag[];
  /** 创建新标签回调 */
  onCreateTag: (name: string) => Promise<Tag>;
  /** 占位符 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
}

export default function TagInput({
  value,
  onChange,
  availableTags,
  onCreateTag,
  placeholder = "输入标签名称...",
  disabled = false,
}: TagInputProps) {
  const [input, setInput] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 已选中的标签对象
  const selectedTags = availableTags.filter((t) => value.includes(t.id));

  // 过滤建议（排除已选中的）
  const suggestions = availableTags.filter(
    (t) =>
      !value.includes(t.id) &&
      t.name.toLowerCase().includes(input.toLowerCase())
  );

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (tagId: string) => {
    onChange([...value, tagId]);
    setInput("");
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const handleRemove = (tagId: string) => {
    onChange(value.filter((id) => id !== tagId));
  };

  const handleCreate = async () => {
    if (!input.trim()) return;
    try {
      const newTag = await onCreateTag(input.trim());
      onChange([...value, newTag.id]);
      setInput("");
      setShowDropdown(false);
    } catch {
      // 创建失败（可能重名）
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0) {
        handleSelect(suggestions[0].id);
      } else if (input.trim()) {
        handleCreate();
      }
    } else if (e.key === "Backspace" && !input && selectedTags.length > 0) {
      handleRemove(selectedTags[selectedTags.length - 1].id);
    }
  };

  return (
    <div className="relative">
      {/* 标签容器 */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 px-3 py-2 min-h-[42px] focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/10 transition-all">
        {selectedTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: tag.color || "#6366F1" }}
          >
            {tag.name}
            {!disabled && (
              <button
                type="button"
                onClick={() => handleRemove(tag.id)}
                className="hover:bg-white/20 rounded p-0.5 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedTags.length === 0 ? placeholder : ""}
          disabled={disabled}
          className="flex-1 min-w-[100px] text-sm outline-none bg-transparent"
        />
      </div>

      {/* 下拉建议 */}
      {showDropdown && (input || suggestions.length > 0) && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto"
        >
          {suggestions.length > 0 ? (
            suggestions.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => handleSelect(tag.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition-colors"
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: tag.color || "#6366F1" }}
                />
                <span>{tag.name}</span>
                <span className="ml-auto text-xs text-slate-400">
                  {tag.collection_count} 个知识库
                </span>
              </button>
            ))
          ) : input.trim() ? (
            <button
              type="button"
              onClick={handleCreate}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition-colors text-blue-600"
            >
              <Plus className="h-4 w-4" />
              创建标签 &quot;{input}&quot;
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
