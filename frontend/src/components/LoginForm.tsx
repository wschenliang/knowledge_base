"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { Database, User, Lock, UserPlus, LogIn, Sparkles, BookOpen, Search, MessageSquare } from "lucide-react";

export default function LoginForm() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    <div className="flex min-h-screen">
      {/* 左侧品牌展示区 */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950">
        {/* 背景装饰 */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-blue-600/5 blur-3xl" />
        </div>

        {/* 网格背景 */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }} />

        <div className="relative z-10 flex flex-col justify-center px-16">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-2xl shadow-blue-500/30">
              <Database className="h-7 w-7 text-white" strokeWidth={2.2} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">KnowledgeBase</h2>
              <p className="text-xs text-blue-300/60 font-medium tracking-widest uppercase">Enterprise Edition</p>
            </div>
          </div>

          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            智能知识管理<br />
            <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">驱动业务决策</span>
          </h1>
          <p className="text-lg text-slate-400 leading-relaxed mb-12 max-w-md">
            基于 RAG 技术构建的企业级知识库平台，让组织知识高效流转，赋能团队智能协作。
          </p>

          {/* 特性列表 */}
          <div className="space-y-4">
            {[
              { icon: BookOpen, title: "文档管理", desc: "支持多种格式文档上传与智能分块" },
              { icon: Search, title: "语义搜索", desc: "向量检索精准匹配，快速定位知识" },
              { icon: MessageSquare, title: "智能问答", desc: "AI 驱动对话，基于知识库精准回答" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4 group">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 border border-white/10 group-hover:bg-white/10 transition-colors">
                  <item.icon className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="text-xs text-slate-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 右侧登录表单 */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-sm animate-slide-up">
          {/* 移动端 Logo */}
          <div className="mb-8 text-center lg:hidden">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20 mb-3">
              <Database className="h-7 w-7 text-white" strokeWidth={2.2} />
            </div>
            <h2 className="text-xl font-bold text-slate-900">KnowledgeBase</h2>
          </div>

          <div className="mb-8">
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
                  className="block w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none"
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
                    className="block w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none"
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
                  className="block w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none"
                  placeholder="输入密码"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
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

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError("");
                }}
                className="text-sm text-slate-500 hover:text-blue-600 transition-colors"
              >
                {isRegister ? "已有账号？点击登录" : "没有账号？点击注册"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
