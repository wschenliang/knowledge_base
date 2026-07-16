"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Database, User, Lock, UserPlus, LogIn, Sparkles, BookOpen, Search, MessageSquare } from "lucide-react";
import LegalDialog from "@/components/LegalDialog";
import { PRIVACY_POLICY, TERMS_OF_SERVICE, type LegalDoc } from "@/lib/legal-content";

/* OAuth Provider 品牌 SVG 图标（保持独立组件，可复用） */
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

/** 当前激活的法律文档类型：'terms' | 'privacy' | null */
type LegalDocKey = "terms" | "privacy";

const LEGAL_DOC_MAP: Record<LegalDocKey, LegalDoc> = {
  terms: TERMS_OF_SERVICE,
  privacy: PRIVACY_POLICY,
};

/** 表单模式：登录 or 注册。由调用方决定，不在内部 toggle */
type AuthMode = "login" | "register";

interface LoginFormProps {
  /** 决定渲染登录表单还是注册表单 */
  mode: AuthMode;
}

/**
 * 登录 / 注册表单组件（专用）
 * - 页面侧：`/login` 渲染 <LoginForm mode="login" />
 * - 页面侧：`/register` 渲染 <LoginForm mode="register" />
 * 内部不再提供模式切换，模式切换通过相邻的跨页面 Link 完成
 */
export default function LoginForm({ mode }: LoginFormProps) {
  const isRegister = mode === "register";
  const { login, register } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // 控制法律协议弹窗的打开状态与当前展示的文档类型
  const [legalDocKey, setLegalDocKey] = useState<LegalDocKey | null>(null);
  // 后端已配置的 OAuth Provider 列表：仅在登录页加载，未配置则不显示 OAuth 区
  const [oauthProviders, setOauthProviders] = useState<
    Array<{ name: string; configured: boolean }>
  >([]);

  // 拉取后端 Provider 配置（仅在登入页有效；该端点是公开的）
  useEffect(() => {
    if (isRegister) return;
    let cancelled = false;
    api
      .listOAuthProviders()
      .then((res) => {
        if (cancelled) return;
        setOauthProviders(
          (res.providers || []).filter((p) => p.configured),
        );
      })
      .catch(() => {
        // 低调失败：不阻塞密码登入
        if (!cancelled) setOauthProviders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isRegister]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isRegister) {
        await register(username, password, displayName || undefined);
      } else {
        await login(username, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* 左侧品牌区 — 浅色渐变 + 点阵装饰，与内部页面浅色基调一致 */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-blue-50/60 via-white to-indigo-50/60 border-r border-slate-200/60">
        {/* 几何点阵装饰：与深色版的"网格"对应，但更克制 */}
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='1' cy='1' r='1' fill='%2364748b' fill-opacity='0.35'/%3E%3C/svg%3E")`,
          }}
        />
        {/* 角落柔光：取代深色版的大光晕，浅且仅在边角 */}
        <div className="absolute -top-32 -left-32 h-80 w-80 rounded-full bg-blue-100/40 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-indigo-100/30 blur-3xl" />

        <div className="relative z-10 flex flex-col justify-center px-16 max-w-xl">
          {/* Logo + 品牌名 */}
          <div className="flex items-center gap-3 mb-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
              <Database className="h-7 w-7 text-white" strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">CogniBase</h2>
              <p className="text-xs text-slate-500 font-medium tracking-widest uppercase">Enterprise Edition</p>
            </div>
          </div>

          {/* 主标题（深色字 + 蓝紫渐变强调） */}
          <h1 className="text-4xl font-bold text-slate-900 leading-tight mb-4">
            智能知识管理
            <br />
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              驱动业务决策
            </span>
          </h1>
          <p className="text-base text-slate-600 leading-relaxed mb-10">
            基于 RAG 技术构建的企业级知识库平台，让组织知识高效流转，赋能团队智能协作。
          </p>

          {/* 特性列表 — 浅色卡片，与内部页面 Dashboard 的 KPI 卡风格一致 */}
          <div className="space-y-3">
            {[
              { icon: BookOpen, title: "文档管理", desc: "支持多种格式文档上传与智能分块" },
              { icon: Search, title: "语义搜索", desc: "向量检索精准匹配，快速定位知识" },
              { icon: MessageSquare, title: "智能问答", desc: "AI 驱动对话，基于知识库精准回答" },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-4 rounded-xl border border-slate-200/70 bg-white/70 backdrop-blur-sm p-3.5 hover:bg-white hover:border-slate-300 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 border border-blue-100/60 shrink-0">
                  <item.icon className="h-5 w-5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                  <p className="text-xs text-slate-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 右侧表单区 — 去掉大圆角卡片包裹，与内部页面"开放"风格一致 */}
      <div className="flex flex-1 items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm animate-slide-up">
          {/* 移动端 Logo（与左侧 Logo 一致） */}
          <div className="mb-10 text-center lg:hidden">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20 mb-3">
              <Database className="h-7 w-7 text-white" strokeWidth={2.2} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">CogniBase</h2>
          </div>

          {/* 标题头（图标 + 标题 + 副标题，参考 dashboard/search 页面头部布局） */}
          <div className="mb-8">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/20">
              <LogIn className="h-5 w-5 text-white" strokeWidth={2.2} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">
              {isRegister ? "创建账号" : "欢迎回来"}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              {isRegister ? "注册以开始使用知识库" : "登录以继续访问您的知识库"}
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-100 p-3.5 text-sm text-red-600 flex items-start gap-2">
                <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1.5">
                用户名
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none"
                  placeholder="输入用户名"
                />
              </div>
            </div>

            {isRegister && (
              <div className="animate-slide-up">
                <label htmlFor="displayName" className="block text-sm font-medium text-slate-700 mb-1.5">
                  显示名称
                </label>
                <div className="relative">
                  <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="block w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none"
                    placeholder="可选"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                密码
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none"
                  placeholder="输入密码"
                />
              </div>
            </div>

            {/* 主按钮 — 与 ChatGPT 风格一致采用 slate-900 实色，而非蓝紫渐变 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  处理中...
                </>
              ) : (
                <>
                  {isRegister ? <Sparkles className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                  {isRegister ? "注册" : "登录"}
                </>
              )}
            </button>

            {/* OAuth 第三方登入（仅在登录页呈现，且需后端已配置） */}
            {!isRegister && oauthProviders.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs text-slate-400">或</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <div className="space-y-2">
                  {oauthProviders.map((p) => {
                    const icon =
                      p.name === "microsoft" ? <MicrosoftIcon className="h-4 w-4" /> :
                      p.name === "github" ? <GitHubIcon className="h-4 w-4 text-slate-900" /> :
                      null;
                    const label =
                      p.name === "microsoft" ? "使用 Microsoft 登录" :
                      p.name === "github" ? "使用 GitHub 登录" :
                      `使用 ${p.name} 登录`;
                    return (
                      <a
                        key={p.name}
                        href={api.getOAuthLoginUrl(p.name)}
                        className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:ring-offset-2 transition-all"
                      >
                        {icon}
                        {label}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="text-center pt-2">
              {isRegister ? (
                <Link
                  href="/login"
                  className="text-sm text-slate-500 hover:text-blue-600 transition-colors"
                >
                  已有账号？点击登录
                </Link>
              ) : (
                <Link
                  href="/register"
                  className="text-sm text-slate-500 hover:text-blue-600 transition-colors"
                >
                  没有账号？点击注册
                </Link>
              )}
            </div>

            {/* 服务条款与隐私政策提示 */}
            <p className="text-center text-xs text-slate-500 leading-relaxed pt-1">
              {isRegister ? "注册" : "登录"}即表示同意我们的{" "}
              <button
                type="button"
                onClick={() => setLegalDocKey("terms")}
                className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-blue-600 hover:decoration-blue-500 transition-colors"
              >
                服务条款
              </button>
              {" "}和{" "}
              <button
                type="button"
                onClick={() => setLegalDocKey("privacy")}
                className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-blue-600 hover:decoration-blue-500 transition-colors"
              >
                隐私政策
              </button>
            </p>
          </form>
        </div>
      </div>

      {/* 法律文本弹窗 */}
      <LegalDialog
        open={legalDocKey !== null}
        doc={legalDocKey ? LEGAL_DOC_MAP[legalDocKey] : null}
        onClose={() => setLegalDocKey(null)}
      />
    </div>
  );
}
