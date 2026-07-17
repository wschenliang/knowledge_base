"use client";

import { useMemo } from "react";

interface HighlightedTextProps {
  text: string;
  /** BM25 命中词（大小写不敏感）；undefined 时内部归一化为空数组 */
  terms?: string[];
  /** 高亮样式（默认琥珀色背景） */
  highlightClassName?: string;
  /** 是否大小写敏感，默认 false */
  caseSensitive?: boolean;
}

interface Span {
  start: number;
  end: number;
}

/** 模块级常量空数组，保证引用稳定（避免父组件每次渲染传 [] 导致 useMemo 失效） */
const EMPTY_TERMS: string[] = [];

/**
 * 在文本中找所有命中区间（子串匹配），合并重叠区间，再用 React 切片渲染。
 *
 * 设计要点：
 * - 不用 dangerouslySetInnerHTML，避免 XSS
 * - 区间合并：避免嵌套 <mark>
 * - terms 中空字符串 / 长度 < 2 会被过滤
 * - terms 为 undefined 时归一化为模块级常量 EMPTY_TERMS，避免每次渲染生成新数组导致 useMemo 失效
 */
export default function HighlightedText({
  text,
  terms,
  highlightClassName = "bg-amber-200 text-slate-900 rounded px-0.5",
  caseSensitive = false,
}: HighlightedTextProps) {
  // H2: 归一化 terms 为稳定引用
  const safeTerms = terms ?? EMPTY_TERMS;
  const segments = useMemo(() => {
    const validTerms = safeTerms
      .map((t) => (t || "").trim())
      .filter((t) => t.length >= 2);
    if (validTerms.length === 0 || !text) {
      return [{ key: "0", text, mark: false }];
    }

    const haystack = caseSensitive ? text : text.toLowerCase();
    const spans: Span[] = [];
    for (const term of validTerms) {
      const needle = caseSensitive ? term : term.toLowerCase();
      if (!needle) continue;
      let from = 0;
      while (from < haystack.length) {
        const idx = haystack.indexOf(needle, from);
        if (idx === -1) break;
        spans.push({ start: idx, end: idx + needle.length });
        from = idx + needle.length;
      }
    }

    if (spans.length === 0) {
      return [{ key: "0", text, mark: false }];
    }

    // 区间合并：按 start 排序，扫描时合并重叠 / 相邻区间
    spans.sort((a, b) => a.start - b.start || a.end - b.end);
    const merged: Span[] = [spans[0]];
    for (let i = 1; i < spans.length; i++) {
      const last = merged[merged.length - 1];
      const cur = spans[i];
      if (cur.start <= last.end) {
        last.end = Math.max(last.end, cur.end);
      } else {
        merged.push({ ...cur });
      }
    }

    // 切片
    const result: { key: string; text: string; mark: boolean }[] = [];
    let cursor = 0;
    merged.forEach((span, i) => {
      if (span.start > cursor) {
        result.push({ key: `p-${i}`, text: text.slice(cursor, span.start), mark: false });
      }
      result.push({
        key: `m-${i}`,
        text: text.slice(span.start, span.end),
        mark: true,
      });
      cursor = span.end;
    });
    if (cursor < text.length) {
      result.push({ key: "tail", text: text.slice(cursor), mark: false });
    }
    return result;
  }, [text, safeTerms, caseSensitive]);

  return (
    <>
      {segments.map((seg) =>
        seg.mark ? (
          <mark key={seg.key} className={highlightClassName}>
            {seg.text}
          </mark>
        ) : (
          <span key={seg.key}>{seg.text}</span>
        ),
      )}
    </>
  );
}