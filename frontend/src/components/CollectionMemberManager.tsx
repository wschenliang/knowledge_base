"use client";

import { useState, useEffect, useCallback } from "react";
import {
  UserPlus,
  MoreVertical,
  Trash2,
  ArrowUp,
  ArrowDown,
  Shield,
} from "lucide-react";
import RoleBadge from "./RoleBadge";
import InviteMemberDialog from "./InviteMemberDialog";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { canManageMembers, isAdmin } from "@/lib/permissions";
import type { CollectionMember, AclRole } from "@/types";

interface Props {
  collectionId: string;
  myRole?: AclRole;
}

export default function CollectionMemberManager({
  collectionId,
  myRole,
}: Props) {
  const { user } = useAuth();
  const [members, setMembers] = useState<CollectionMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [transferFor, setTransferFor] = useState<string | null>(null);
  const [transferUsername, setTransferUsername] = useState("");
  const [transferError, setTransferError] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);

  const canManage = isAdmin(user) || canManageMembers(myRole);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.listCollectionMembers(collectionId);
      setMembers(result.items);
    } catch (err) {
      console.error("Failed to load members:", err);
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  if (!canManage) return null;

  async function handleRoleChange(member: CollectionMember, newRole: AclRole) {
    try {
      await api.updateCollectionMemberRole(collectionId, member.user_id, {
        role: newRole,
      });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "修改失败");
    }
    setMenuOpenFor(null);
  }

  async function handleRemove(member: CollectionMember) {
    if (!confirm(`确定移除 ${member.username} 吗？`)) return;
    try {
      await api.removeCollectionMember(collectionId, member.user_id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "移除失败");
    }
    setMenuOpenFor(null);
  }

  async function handleTransfer() {
    if (!transferUsername.trim() || !transferFor) return;
    setTransferLoading(true);
    setTransferError("");
    try {
      await api.transferCollectionOwnership(collectionId, {
        new_owner_username: transferUsername,
      });
      setTransferFor(null);
      setTransferUsername("");
      await load();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "转让失败");
    } finally {
      setTransferLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-900">成员管理</h2>
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <UserPlus className="h-4 w-4" />
          邀请成员
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500">加载中...</div>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-semibold text-white shrink-0">
                {member.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {member.display_name || member.username}
                </p>
                <p className="text-xs text-slate-500">@{member.username}</p>
              </div>
              <RoleBadge role={member.role} size="sm" />
              {member.role !== "owner" && (
                <div className="relative">
                  <button
                    onClick={() =>
                      setMenuOpenFor(
                        menuOpenFor === member.user_id ? null : member.user_id,
                      )
                    }
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                  {menuOpenFor === member.user_id && (
                    <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-slate-200 bg-white shadow-lg z-10 py-1">
                      {member.role === "viewer" && (
                        <button
                          onClick={() => handleRoleChange(member, "editor")}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                          升级为编辑者
                        </button>
                      )}
                      {member.role === "editor" && (
                        <button
                          onClick={() => handleRoleChange(member, "viewer")}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                          降级为访客
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setTransferFor(member.user_id);
                          setTransferUsername(member.username);
                          setMenuOpenFor(null);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-violet-700 hover:bg-violet-50"
                      >
                        <Shield className="h-3.5 w-3.5" />
                        转让所有权
                      </button>
                      <button
                        onClick={() => handleRemove(member)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        移除成员
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <InviteMemberDialog
        collectionId={collectionId}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={() => load()}
      />

      {/* 转让所有权确认对话框 */}
      {transferFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => {
              setTransferFor(null);
              setTransferError("");
            }}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900 mb-4">
              转让所有权
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              当前成员将变更为 Editor,被指定的用户将成为新的 Owner。请输入对方用户名确认。
            </p>

            {transferError && (
              <div className="mb-4 rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-600">
                {transferError}
              </div>
            )}

            <input
              type="text"
              value={transferUsername}
              onChange={(e) => setTransferUsername(e.target.value)}
              placeholder="新 Owner 用户名"
              className="block w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 outline-none"
            />

            <div className="flex gap-3 pt-4 mt-4">
              <button
                onClick={handleTransfer}
                disabled={transferLoading || !transferUsername.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {transferLoading ? "转让中..." : "确认转让"}
              </button>
              <button
                onClick={() => {
                  setTransferFor(null);
                  setTransferError("");
                }}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
