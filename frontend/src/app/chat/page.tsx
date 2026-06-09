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

  if (authLoading) return null;

  return (
    <Layout>
      <div className="mx-auto flex h-full max-w-4xl flex-col">
        <h1 className="mb-4 text-2xl font-bold text-gray-900">问答对话</h1>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-600 border-t-transparent" />
          </div>
        ) : (
          <ChatBox collections={collections} />
        )}
      </div>
    </Layout>
  );
}
