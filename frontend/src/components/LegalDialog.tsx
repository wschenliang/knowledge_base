"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { LegalDoc } from "@/lib/legal-content";

interface Props {
  open: boolean;
  doc: LegalDoc | null;
  onClose: () => void;
}

/**
 * 法律文本弹窗（服务条款 / 隐私政策）
 *
 * - 复用 createPortal 模式（参见 ProfileDialog）：挂载到 document.body，
 *   避免 LoginForm 容器中的 transform/动画影响 fixed 定位。
 * - 内容支持滚动查看（max-height + overflow-y-auto）。
 * - 顶部含标题与最后更新日期，底部含"我知道了"按钮。
 *
 * 设计取舍：法律文本通常较长，因此弹窗内容区允许垂直滚动，弹窗本身不锁
 * body 滚动（避免用户在小屏无法继续阅读）；但 Esc 与点击遮罩关闭仍然可用。
 */
export default function LegalDialog({ open, doc, onClose }: Props) {
  // 客户端挂载标志：避免 SSR hydration 报错
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted || !doc) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={doc.title}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{doc.title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              最后更新：{doc.updatedAt}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 内容区（可滚动） */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-5 text-sm leading-relaxed text-slate-700">
            {doc.sections.map((section, idx) => (
              <section key={idx}>
                <h3 className="text-sm font-semibold text-slate-900 mb-1.5">
                  {section.heading}
                </h3>
                <div className="text-slate-600">{section.body}</div>
              </section>
            ))}
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-slate-100 bg-slate-50/50 shrink-0 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}