"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Layout from "@/components/Layout";
import ChatBox from "@/components/ChatBox";
import type { Collection } from "@/types";

export default function ChatPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [chatKey, setChatKey] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadCollections = useCallback(async () => {
    try {
      const result = await api.listCollections();
      setCollections(result.items);
    } catch (err) {
      console.error("Failed to load collections:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      loadCollections();
    }
  }, [authLoading, isAuthenticated, loadCollections]);

  const handleSelectConversation = useCallback(async (id: string) => {
    try {
      const detail = await api.getConversation(id);
      setActiveConvId(id);
      setChatKey((k) => k + 1);
      window.dispatchEvent(
        new CustomEvent("load-conversation", {
          detail: {
            conversationId: id,
            collectionId: detail.collection_id,
            messages: detail.messages,
          },
        })
      );
    } catch (err) {
      console.error("Failed to load conversation:", err);
    }
  }, []);

  const handleNewConversation = useCallback(() => {
    setActiveConvId(null);
    setChatKey((k) => k + 1);
    setRefreshKey((k) => k + 1);
    window.dispatchEvent(new CustomEvent("new-conversation"));
  }, []);

  const handleDeleteConversation = useCallback(
    (id: string) => {
      if (activeConvId === id) {
        setActiveConvId(null);
        setChatKey((k) => k + 1);
        window.dispatchEvent(new CustomEvent("new-conversation"));
      }
      // 删除后由 ChatSidebar 内部更新列表（通过 refreshKey 触发）
      setRefreshKey((k) => k + 1);
    },
    [activeConvId]
  );

  const handleConversationCreated = useCallback((id: string) => {
    setActiveConvId(id);
    setRefreshKey((k) => k + 1);
  }, []);

  if (authLoading) return null;

  return (
    <Layout
      activeConversationId={activeConvId}
      onSelectConversation={handleSelectConversation}
      onNewConversation={handleNewConversation}
      onDeleteConversation={handleDeleteConversation}
      refreshKey={refreshKey}
    >
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="h-10 w-10 rounded-full border-4 border-slate-200" />
              <div className="absolute inset-0 h-10 w-10 animate-spin rounded-full border-4 border-transparent border-t-blue-600" />
            </div>
            <p className="text-sm text-slate-500">加载知识库...</p>
          </div>
        </div>
      ) : (
        <ChatBox
          key={chatKey}
          collections={collections}
          conversationId={activeConvId}
          onConversationCreated={handleConversationCreated}
          onNewConversation={handleNewConversation}
        />
      )}
    </Layout>
  );
}