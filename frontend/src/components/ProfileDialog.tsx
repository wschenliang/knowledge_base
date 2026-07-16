"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, X, ShieldCheck, Link2, Unlink, Loader2 } from "lucide-react";
import type { User } from "@/types";
import { fileToDataUrl, loadAvatar, saveAvatar } from "@/lib/avatar";
import { api } from "@/lib/api";
import ConfirmDialog from "@/components/ConfirmDialog";

interface OAuthBindingInfo {
  provider: string;
  provider_email?: string | null;
  provider_display_name?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
}

interface OAuthProviderInfo {
  name: string;
  configured: boolean;
}

/* 品牌图标（同 LoginForm，复用内联 SVG） */
function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"
      />
    </svg>
  );
}

function providerBrand(p: string): React.ReactNode {
  if (p === "microsoft") return <MicrosoftIcon className="h-4 w-4" />;
  if (p === "github") return <GitHubIcon className="h-4 w-4 text-slate-900" />;
  return <Link2 className="h-4 w-4 text-slate-500" />;
}

function providerLabel(p: string): string {
  if (p === "microsoft") return "Microsoft";
  if (p === "github") return "GitHub";
  return p;
}

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

  // ===== OAuth 绑定状态 =====
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderInfo[]>([]);
  const [oauthBindings, setOauthBindings] = useState<OAuthBindingInfo[]>([]);
  const [oauthPasswordSet, setOauthPasswordSet] = useState(true);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthPending, setOauthPending] = useState<string | null>(null);
  const [unbindTarget, setUnbindTarget] = useState<{
    provider: string;
    email?: string | null;
  } | null>(null);

  // 弹窗打开 → 拉取 OAuth 详情
  useEffect(() => {
    if (!open || !mounted) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOauthLoading(true);
    Promise.all([api.listOAuthProviders(), api.listOAuthBindings()])
      .then(([providers, bindings]) => {
        if (cancelled) return;
        setOauthProviders(
          (providers.providers || []).filter((p) => p.configured),
        );
        setOauthBindings(bindings.bindings || []);
        setOauthPasswordSet(Boolean(bindings.password_set));
      })
      .catch(() => {
        if (cancelled) return;
        setOauthProviders([]);
        setOauthBindings([]);
      })
      .finally(() => {
        if (cancelled) return;
        setOauthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mounted]);

  /** 根据 provider 名查找当前绑定记录 */
  const findBinding = (provider: string) =>
    oauthBindings.find((b) => b.provider === provider) || null;

  /** 解锁一个 Provider：调用 startOAuthBind 获得 authorize_url，跳走 */
  const handleStartBind = async (provider: string) => {
    setError("");
    setOauthPending(provider);
    try {
      const res = await api.startOAuthBind(provider);
      // 全跳：让用户走完 Provider 授权，回到 /oauth-callback。
      // 用 assign() 方法调用代替直接赋值 href，避免 lint 规则对
      // "外部变量不可变" 的误报；二者语义等价。
      window.location.assign(res.authorize_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "发起绑定失败");
      setOauthPending(null);
    }
  };

  /** 解绑请求：确认弹窗 → DELETE → 重新拉列表 */
  const confirmUnbind = async () => {
    if (!unbindTarget) return;
    const provider = unbindTarget.provider;
    setError("");
    setOauthPending(provider);
    setUnbindTarget(null);
    try {
      await api.unbindOAuthProvider(provider);
      const fresh = await api.listOAuthBindings();
      setOauthBindings(fresh.bindings || []);
      setOauthPasswordSet(Boolean(fresh.password_set));
    } catch (e) {
      setError(e instanceof Error ? e.message : "解绑失败");
    } finally {
      setOauthPending(null);
    }
  };

  /** 判断某 Provider 的解绑是否允许（保留至少一种登入方式） */
  const canUnbind = (provider: string) => {
    if (oauthPasswordSet) return true;
    const others = oauthBindings.filter((b) => b.provider !== provider);
    return others.length > 0;
  };

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

        {/* 第三方账号 */}
        {oauthProviders.length > 0 && (
          <div className="px-6 pb-4">
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
              <label className="block text-xs font-medium text-slate-600">
                第三方账号
              </label>
            </div>
            <div className="space-y-2">
              {oauthLoading && (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  加载中...
                </div>
              )}
              {!oauthLoading && oauthProviders.map((p) => {
                const binding = findBinding(p.name);
                const bound = !!binding;
                const allowed = !bound || canUnbind(p.name);
                const disabled = oauthPending === p.name;
                return (
                  <div
                    key={p.name}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-50 border border-slate-200">
                      {providerBrand(p.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">
                        {providerLabel(p.name)}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {bound
                          ? binding?.provider_email ||
                            binding?.provider_display_name ||
                            "已绑定"
                          : "未绑定"}
                      </p>
                    </div>
                    {bound ? (
                      <button
                        type="button"
                        disabled={!allowed || disabled}
                        onClick={() =>
                          setUnbindTarget({
                            provider: p.name,
                            email: binding?.provider_email,
                          })
                        }
                        title={!allowed ? "请先设置密码或绑定其他方式" : undefined}
                        className="flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                      >
                        {disabled ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Unlink className="h-3 w-3" />
                        )}
                        解绑
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => handleStartBind(p.name)}
                        className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                      >
                        {disabled ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "绑定"
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
              {!oauthPasswordSet && oauthBindings.length === 0 && (
                <p className="pt-1 text-[11px] text-amber-600">
                  你当前未设置本地密码，请至少绑定一种第三方登入方式。
                </p>
              )}
            </div>
          </div>
        )}

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

      {/* 解绑确认弹窗 */}
      <ConfirmDialog
        open={unbindTarget !== null}
        title={`解绑 ${unbindTarget ? providerLabel(unbindTarget.provider) : ""}？`}
        message={
          unbindTarget
            ? `解绑后将无法再通过 ${providerLabel(unbindTarget.provider)} 登入该账号${
                unbindTarget.email ? `（绑定的邮箱：${unbindTarget.email}）` : ""
              }。确认要继续吗？`
            : ""
        }
        confirmLabel="确认解绑"
        confirmVariant="danger"
        onConfirm={confirmUnbind}
        onCancel={() => setUnbindTarget(null)}
      />
    </div>,
    document.body
  );
}