"use client";

import type { Collection, AclRole } from "@/types";
import Link from "next/link";
import { FileText, Calendar, ArrowRight } from "lucide-react";
import RoleBadge from "./RoleBadge";

// 根据 id 生成稳定的渐变色
const gradients = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-blue-600",
  "from-fuchsia-500 to-violet-600",
  "from-lime-500 to-green-600",
];

function getGradient(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

interface Props {
  collection: Collection;
}

export default function CollectionCard({ collection }: Props) {
  const gradient = getGradient(collection.id);
  const myRole = collection.my_role as AclRole | undefined;

  return (
    <Link
      href={`/collections/${collection.id}`}
      className="group block rounded-2xl border border-slate-200 bg-white shadow-sm card-hover overflow-hidden"
    >
      {/* 顶部彩色条带 */}
      <div className={`h-1.5 bg-gradient-to-r ${gradient}`} />

      <div className="p-5">
        <div className="flex items-start justify-between mb-3 gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-900 truncate group-hover:text-blue-700 transition-colors">
              {collection.name}
            </h3>
            {collection.description && (
              <p className="mt-1 text-sm text-slate-500 line-clamp-2 leading-relaxed">
                {collection.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {myRole && <RoleBadge role={myRole} size="sm" />}
            <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>

        {/* 标签展示 */}
        {collection.tags && collection.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {collection.tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium text-white"
                style={{ backgroundColor: tag.color || "#6366F1" }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-slate-500 pt-3 border-t border-slate-100">
          <span className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-medium">{collection.document_count}</span> 个文档
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            {new Date(collection.created_at).toLocaleDateString("zh-CN")}
          </span>
        </div>
      </div>
    </Link>
  );
}
