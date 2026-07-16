"use client";

import { Database } from "lucide-react";

/**
 * 页脚
 * - 简洁版权信息
 */
export default function LandingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-100 bg-white py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Database className="h-4 w-4 text-slate-400" />
          <span>CogniBase Enterprise</span>
        </div>
        <p className="text-xs text-slate-400">
          &copy; {year} CogniBase. 保留所有权利。
        </p>
      </div>
    </footer>
  );
}
