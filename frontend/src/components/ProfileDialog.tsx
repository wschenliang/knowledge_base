"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, X } from "lucide-react";
import type { User } from "@/types";
import { fileToDataUrl, loadAvatar, saveAvatar } from "@/lib/avatar";

interface Props {
  open: boolean;
  user: User;
  /** 头像变化时通知上层更新（仅头像） */
  onAvatarChange?: (avatar: string | null) => void;
  onClose: () => void;
}

/**
 * 编辑个人资料弹窗（仿 ChatGPT 风格，居中弹窗）
 *
 * 关键点：使用 createPortal 渲染到 document.body，避免被父级 Layout 中的
 * `transition-transform` 创建的 containing block 影响（fixed 会"贴左弹出"）。
 * 这样弹窗始终居中于视口，遮罩也会盖满全屏。
 *
 * - 显示头像（可点击 / 相机图标 上传本地图片，仅前端 localStorage 持久化）
 * - 显示名称、用户名、邮箱均为只读展示
 * - 头像下方一行小字提示
 * - 底部"取消 / 保存"
 *
 * 注意：用户要求"用户名、邮箱不可被编辑"，因此只有头像可操作。
 */
export default function ProfileDialog({ open, user, onAvatarChange, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 初始头像通过 lazy initializer 派生；因为 if (!open) return null 会让组件
  // 在 open=true 时每次都重新挂载，因此无需在 effect 中重置。
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(
    () => loadAvatar(user.id) || user.avatar || null
  );
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState(false);
  // 客户端挂载标志：createPortal 需要 document.body，仅在浏览器端可用；
  // 用 mounted 防止 SSR 期间渲染 portal 导致 hydration mismatch。
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

  // 打开时锁定 body 滚动（避免背景跟随滚动）
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open || !mounted) return null;

  const triggerPick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 允许重选同一文件，清空 value
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }
    try {
      setError("");
      const dataUrl = await fileToDataUrl(file);
      setPendingAvatar(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取图片失败");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const original = loadAvatar(user.id) || user.avatar || null;
      if (pendingAvatar !== original) {
        if (pendingAvatar) {
          saveAvatar(user.id, pendingAvatar);
        }
        onAvatarChange?.(pendingAvatar);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    onClose();
  };

  const displayName = user.display_name || user.username || "未命名用户";
  const username = user.username || "";
  const email = user.email || "未设置邮箱";

  // 头像首字母（无图时使用）
  const initial = (displayName || username || "U").charAt(0).toUpperCase();

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[460px] max-w-[92vw] rounded-2xl bg-white shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          aria-label="关闭"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* 标题 */}
        <div className="px-6 pt-5 pb-2">
          <h2 className="text-base font-semibold text-slate-900">编辑个人资料</h2>
        </div>

        {/* 头像区 */}
        <div className="flex flex-col items-center pt-2 pb-4">
          <div className="relative">
            {pendingAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pendingAvatar}
                alt="头像"
                className="h-24 w-24 rounded-full object-cover shadow-md"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-2xl font-semibold text-white shadow-md">
                {initial}
              </div>
            )}
            <button
              type="button"
              onClick={triggerPick}
              aria-label="更换头像"
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-white text-slate-600 shadow-md hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              <Camera className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          {error && (
            <p className="mt-3 text-xs text-red-600">{error}</p>
          )}
        </div>

        {/* 表单字段（全部只读展示） */}
        <div className="px-6 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">显示名称</label>
            <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
              {displayName}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">用户名</label>
            <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
              {username}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">邮箱</label>
            <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
              {email}
            </div>
          </div>
          <p className="pt-1 pb-3 text-center text-xs text-slate-500">
            你的个人资料有助于大家在群聊中认出你。
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-3">
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="rounded-lg px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-60"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}