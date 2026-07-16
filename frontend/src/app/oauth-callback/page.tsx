"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

/**
 * OAuth 流程在此落地：
 * - URL: `${OAUTH_FRONTEND_CALLBACK}?provider=<...>&action=<...>&token=<JWT>&error=<...>`
 *   由后端 /api/v1/auth/oauth/{provider}/callback 在 302 时填入。
 *
 * 处理分支：
 *  - token 存在 + action∈{login, signup, bind_existing}
 *      → loginWithToken（使 AuthContext 更新） + 落地提示，按钮跳转到首页
 *  - action=bind_success
 *      → 用户已登录，无需新 token；跳到个人页或首页
 *  - action=error
 *      → 展示错误详情，按钮返回登录页或首页
 */
function OAuthCallbackHandler() {
  const params = useSearchParams();
  const router = useRouter();
  const { loginWithToken } = useAuth();

  const action = params.get("action") || "";
  const token = params.get("token") || "";
  const provider = params.get("provider") || "";
  const username = params.get("username") || "";
  const errCode = params.get("error") || "";

  // 起始状态由 URL 参数推导：避免同步在 effect 里 setState
  function deriveInitialPhase(): "processing" | "done" | "error" {
    if (errCode || action === "error") return "error";
    if (action === "bind_success") return "done";
    if (token) return "processing";
    return "error";
  }
  const [phase, setPhase] = useState<"processing" | "done" | "error">(
    deriveInitialPhase,
  );
  const [errorMsg, setErrorMsg] = useState<string>(() =>
    errCode ? _humanizeError(errCode) : "",
  );

  // 仅有 token 且需要换取身份时起异步调用：完成后才调整 phase
  useEffect(() => {
    if (!token) return;
    if (action !== "login" && action !== "signup" && action !== "bind_existing") {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await loginWithToken(token);
        if (cancelled) return;
        setPhase("done");
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : "登录失败");
        setPhase("error");
        api.setToken(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 完成态：自动跳走（让用户能在小窗口里看到提示再走）
  useEffect(() => {
    if (phase !== "done") return;
    const target =
      action === "bind_success" ? "/dashboard" : "/dashboard";
    const t = setTimeout(() => router.replace(target), 1500);
    return () => clearTimeout(t);
  }, [phase, action, router]);

  return (
    <CallbackCard
      phase={phase}
      action={action}
      provider={provider}
      username={username}
      errorMsg={errorMsg}
      errCode={errCode}
      onPrimary={() => {
        if (phase === "error") {
          router.replace("/login");
        } else {
          router.replace("/dashboard");
        }
      }}
      onSecondary={() => router.replace("/")}
    />
  );
}

/** 人类可读的错误映射（与后端 _redirect_frontend.error 对齐） */
function _humanizeError(code: string): string {
  switch (code) {
    case "invalid_state":
      return "登录状态校验失败（链接过期或被篡改），请重试。";
    case "token_exchange_failed":
      return "与第三方服务交换令牌失败，请稍后重试。";
    case "profile_fetch_failed":
      return "获取第三方账号资料失败，请稍后重试。";
    case "no_access_token":
      return "第三方未返回访问令牌，请稍后重试。";
    case "empty_provider_user_id":
      return "第三方账号信息不完整，请稍后重试。";
    case "missing_code_or_state":
      return "回调参数缺失，请重新发起登录。";
    case "user_resolution_failed":
      return "账号匹配失败，请联系管理员。";
    case "already_bound_to_other_user":
      return "该第三方账号已绑定到其他用户，请联系管理员。";
    case "provider_already_bound":
      return "你已经绑定过这种登录方式。";
    case "user_not_found_or_inactive":
      return "当前账号不可用，请重新登录。";
    case "access_denied":
      return "你拒绝了授权申请，无法登录。";
    case "":
      return "登录失败，未知原因。";
    default:
      return `登录失败：${code}`;
  }
}

interface CardProps {
  phase: "processing" | "done" | "error";
  action: string;
  provider: string;
  username: string;
  errorMsg: string;
  errCode: string;
  onPrimary: () => void;
  onSecondary: () => void;
}

function CallbackCard({
  phase,
  action,
  provider,
  username,
  errorMsg,
  errCode,
  onPrimary,
  onSecondary,
}: CardProps) {
  const providerLabel =
    provider === "microsoft" ? "Microsoft" :
    provider === "github" ? "GitHub" :
    provider || "第三方";

  // 标题与文案
  let title = "处理中...";
  let desc = "";
  let icon: React.ReactNode = <Loader2 className="h-10 w-10 animate-spin text-blue-500" />;
  let primaryLabel = "前往首页";
  if (phase === "done" && action === "bind_success") {
    title = `已成功绑定 ${providerLabel}`;
    desc = "正在返回个人页...";
    icon = <CheckCircle className="h-10 w-10 text-green-500" />;
  } else if (phase === "done" && action === "signup") {
    title = `欢迎加入`;
    desc = `已为你自动创建账号${username ? `（用户名：${username}）` : ""}，即将进入首页...`;
    icon = <CheckCircle className="h-10 w-10 text-green-500" />;
  } else if (phase === "done" && action === "bind_existing") {
    title = `登录成功`;
    desc = `已将 ${providerLabel} 关联到你的账号，即将进入首页...`;
    icon = <CheckCircle className="h-10 w-10 text-green-500" />;
  } else if (phase === "done" && action === "login") {
    title = `登录成功`;
    desc = `通过 ${providerLabel} 登录，即将进入首页...`;
    icon = <CheckCircle className="h-10 w-10 text-green-500" />;
  } else if (phase === "error") {
    title = `${providerLabel} 登录失败`;
    desc = errorMsg;
    icon = <AlertCircle className="h-10 w-10 text-red-500" />;
    primaryLabel = "返回登录";
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4">{icon}</div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {desc && (
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            {desc}
          </p>
        )}
        {phase === "error" && errCode && (
          <p className="mt-2 text-xs text-slate-400 font-mono">code: {errCode}</p>
        )}

        {phase !== "processing" && (
          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={onPrimary}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
            >
              {primaryLabel}
            </button>
            <button
              type="button"
              onClick={onSecondary}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              首页
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">CogniBase</h1>
          <p className="mt-1 text-sm text-slate-500">第三方登录回调</p>
        </div>
        {/* useSearchParams 必须包裹在 Suspense 边界内（静态导出需要） */}
        <Suspense
          fallback={
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center text-sm text-slate-500">
              加载中...
            </div>
          }
        >
          <OAuthCallbackHandler />
        </Suspense>
      </div>
    </div>
  );
}
