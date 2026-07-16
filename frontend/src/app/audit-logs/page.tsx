"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Layout from "@/components/Layout";
import type { AuditLogItem, AuditLogQueryParams } from "@/types";
import {
  ShieldCheck,
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  AlertCircle,
  Loader2,
} from "lucide-react";

/** action code -> 中文描述 */
const ACTION_LABELS: Record<string, string> = {
  "auth.login": "用户登录",
  "auth.register": "用户注册",
  "collection.create": "创建知识库",
  "collection.tags_update": "更新知识库标签",
  "doc.upload": "上传文档",
  "doc.delete": "删除文档",
  "tag.create": "创建标签",
  "tag.update": "编辑标签",
  "tag.delete": "删除标签",
  "conversation.delete": "删除对话",
  "acl.grant": "授予权限",
  "acl.update": "修改角色",
  "acl.revoke": "移除成员",
  "acl.transfer": "转移所有权",
};

const ACTION_OPTIONS = [
  { value: "", label: "全部操作" },
  { value: "auth.login", label: "用户登录" },
  { value: "auth.register", label: "用户注册" },
  { value: "collection.create", label: "创建知识库" },
  { value: "collection.tags_update", label: "更新知识库标签" },
  { value: "doc.upload", label: "上传文档" },
  { value: "doc.delete", label: "删除文档" },
  { value: "tag.create", label: "创建标签" },
  { value: "tag.update", label: "编辑标签" },
  { value: "tag.delete", label: "删除标签" },
  { value: "conversation.delete", label: "删除对话" },
  { value: "acl.grant", label: "授予权限" },
  { value: "acl.update", label: "修改角色" },
  { value: "acl.revoke", label: "移除成员" },
  { value: "acl.transfer", label: "转移所有权" },
];

const RESOURCE_OPTIONS = [
  { value: "", label: "全部资源" },
  { value: "user", label: "用户" },
  { value: "collection", label: "知识库" },
  { value: "document", label: "文档" },
  { value: "tag", label: "标签" },
  { value: "conversation", label: "对话" },
];

const PAGE_SIZE = 30;

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getActionBadgeColor(action: string): string {
  if (action.startsWith("auth.")) return "bg-green-100 text-green-700";
  if (action.startsWith("acl.")) return "bg-amber-100 text-amber-700";
  if (action.startsWith("doc.")) return "bg-blue-100 text-blue-700";
  if (action.startsWith("tag.")) return "bg-purple-100 text-purple-700";
  if (action.startsWith("collection.")) return "bg-indigo-100 text-indigo-700";
  if (action.startsWith("conversation.")) return "bg-slate-100 text-slate-700";
  return "bg-slate-100 text-slate-600";
}

export default function AuditLogsPage() {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  // 筛选条件
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [keyword, setKeyword] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params: AuditLogQueryParams = {
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      };
      if (action) params.action = action;
      if (resourceType) params.resource_type = resourceType;
      if (keyword) params.keyword = keyword;
      if (startTime) params.start_time = new Date(startTime).toISOString();
      if (endTime) params.end_time = new Date(endTime).toISOString();

      const data = await api.listAuditLogs(params);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, action, resourceType, keyword, startTime, endTime]);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadData();
    }
  }, [authLoading, isAuthenticated, loadData]);

  // 重置到第一页当筛选条件变化
  useEffect(() => {
    setPage(0);
  }, [action, resourceType, keyword, startTime, endTime]);

  const handleExport = async () => {
    try {
      setExporting(true);
      const params: AuditLogQueryParams = {};
      if (action) params.action = action;
      if (resourceType) params.resource_type = resourceType;
      if (keyword) params.keyword = keyword;
      if (startTime) params.start_time = new Date(startTime).toISOString();
      if (endTime) params.end_time = new Date(endTime).toISOString();

      const blob = await api.exportAuditLogs(params);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const now = new Date().toISOString().slice(0, 10);
      a.download = `audit_logs_${now}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  if (authLoading) return null;

  // 非 admin 不可访问
  if (user?.role !== "admin") {
    return (
      <Layout>
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <ShieldCheck className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">仅管理员可访问审计日志</p>
          </div>
        </div>
      </Layout>
    );
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* 页头 */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">操作审计日志</h1>
              <p className="text-xs text-slate-500">记录所有关键操作，满足企业合规要求</p>
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            导出 CSV
          </button>
        </div>

        {/* 筛选栏 */}
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {/* 操作类型 */}
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* 资源类型 */}
            <select
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {RESOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* 关键词搜索 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="搜索关键词..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* 开始时间 */}
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              title="开始时间"
            />

            {/* 结束时间 */}
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              title="结束时间"
            />
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-100 p-3.5 text-sm text-red-600 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
            <button
              onClick={loadData}
              className="ml-auto text-xs font-medium text-red-700 hover:underline"
            >
              重试
            </button>
          </div>
        )}

        {/* 日志表格 */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              <span className="ml-2 text-sm text-slate-500">加载中...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <ShieldCheck className="h-10 w-10 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">暂无审计日志</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="px-4 py-3 text-left font-medium text-slate-500">时间</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">用户</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">操作</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">资源</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">IP 地址</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">详情</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 text-xs">
                        {formatTime(log.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="font-medium text-slate-800">
                          {log.username || log.user_id || "系统"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getActionBadgeColor(log.action)}`}
                        >
                          {getActionLabel(log.action)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        <span className="font-mono text-slate-500">
                          {log.resource_type}
                        </span>
                        <span className="mx-1 text-slate-300">/</span>
                        <span className="font-mono text-slate-500 truncate max-w-[120px] inline-block align-bottom">
                          {log.resource_id.slice(0, 8)}...
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 font-mono">
                        {log.ip_address || "-"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px]">
                        {log.detail ? (
                          <details className="group">
                            <summary className="cursor-pointer truncate text-slate-500 hover:text-slate-700 list-none">
                              查看详情
                            </summary>
                            <pre className="mt-1 rounded bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-600 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(log.detail, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 分页 */}
          {total > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3">
              <span className="text-xs text-slate-500">
                共 {total} 条记录，第 {page + 1}/{totalPages} 页
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  上一页
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  下一页
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
