"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { FavoriteItem } from "@/types";
import { Heart, ExternalLink, Trash2, Pencil, Check, X } from "lucide-react";

interface Props {
  item: FavoriteItem;
  onRemoved: (messageId: string) => void;
}

export default function FavoriteCard({ item, onRemoved }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(item.note || "");
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await api.removeFavorite(item.message_id);
      onRemoved(item.message_id);
    } catch {
      setRemoving(false);
    }
  };

  const handleSaveNote = async () => {
    try {
      await api.updateFavoriteNote(item.message_id, note);
      setEditing(false);
    } catch {
      // ignore
    }
  };

  const handleGoToConversation = () => {
    router.push(`/chat?conversation=${item.conversation_id}`);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const truncate = (text: string, maxLen: number) => {
    if (!text) return "";
    return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
  };

  return (
    <div className="group rounded-xl border border-slate-200 bg-white p-4 hover:shadow-md transition-all">
      {/* 头部：知识库标签 + 时间 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {item.collection_name && (
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
              {item.collection_name}
            </span>
          )}
          <span className="text-xs text-slate-400">{formatTime(item.created_at)}</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleGoToConversation}
            className="rounded p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
            title="查看原文"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setEditing(!editing)}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            title="编辑备注"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleRemove}
            disabled={removing}
            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
            title="取消收藏"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 问题 */}
      {item.question_content && (
        <div className="mb-2">
          <span className="text-xs font-medium text-slate-500">问：</span>
          <span className="text-sm text-slate-700">
            {truncate(item.question_content, 120)}
          </span>
        </div>
      )}

      {/* 回答 */}
      <div className="mb-2">
        <span className="text-xs font-medium text-slate-500">答：</span>
        <span className="text-sm text-slate-800 leading-relaxed">
          {truncate(item.message_content, 300)}
        </span>
      </div>

      {/* 备注 */}
      {editing ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="添加备注..."
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
            autoFocus
          />
          <button
            onClick={handleSaveNote}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => { setEditing(false); setNote(item.note || ""); }}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : item.note ? (
        <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2">
          <span className="text-xs font-medium text-amber-600">备注：</span>
          <span className="text-sm text-amber-800">{item.note}</span>
        </div>
      ) : null}
    </div>
  );
}
