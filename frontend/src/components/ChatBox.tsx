"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { ChatMessage, Collection, StreamEvent } from "@/types";
import SourceCard from "./SourceCard";
import HighlightedText from "./HighlightedText";
import type { SearchFilters } from "@/types";
import {
  Send,
  Bot,
  User,
  ChevronDown,
  ChevronUp,
  Database,
  Sparkles,
  Square,
  Plus,
  Mic,
  Compass,
  FileSearch,
  Lightbulb,
  CheckCircle2,
  Square as StopIcon,
  Heart,
} from "lucide-react";

interface Props {
  collections: Collection[];
  conversationId?: string | null;
  onConversationCreated?: (id: string) => void;
  onNewConversation?: () => void;
}

export default function ChatBox({
  collections,
  conversationId,
  onConversationCreated,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState("");
  const [useReranker, setUseReranker] = useState(true);
  const [expandedSources, setExpandedSources] = useState<Record<number, boolean>>({});
  const [showCollectionMenu, setShowCollectionMenu] = useState(false);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const convIdRef = useRef<string | null>(conversationId ?? null);
  const collectionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    convIdRef.current = conversationId ?? null;
  }, [conversationId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (collectionMenuRef.current && !collectionMenuRef.current.contains(e.target as Node)) {
        setShowCollectionMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleLoad = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.messages) {
        setMessages(detail.messages);
        // 从消息中提取收藏状态
        const favs: Record<string, boolean> = {};
        for (const msg of detail.messages) {
          if (msg.id && msg.is_favorited) {
            favs[msg.id] = true;
          }
        }
        setFavorites(favs);
      }
      if (detail.collectionId) {
        setSelectedCollection(detail.collectionId);
      }
    };
    const handleNew = () => {
      setMessages([]);
      setExpandedSources({});
      setSelectedCollection("");
      setFavorites({});
    };

    window.addEventListener("load-conversation", handleLoad);
    window.addEventListener("new-conversation", handleNew);
    return () => {
      window.removeEventListener("load-conversation", handleLoad);
      window.removeEventListener("new-conversation", handleNew);
    };
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !selectedCollection || loading) return;

    const userMessage: ChatMessage = { role: "user", content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    const queryText = input.trim();
    setInput("");
    setLoading(true);

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const controller = new AbortController();
    abortRef.current = controller;

    // 本期不引入 ChatBox 内的筛选入口（仅在 /search 抽屉中可用）；
    // ChatBox 仍透传 filters（如未来扩展"高级筛选"图标，可在此组装）
    const filters: SearchFilters | undefined = undefined;

    try {
      await api.chatStream(
        {
          query: queryText,
          collection_id: selectedCollection,
          conversation_id: convIdRef.current ?? undefined,
          use_reranker: useReranker,
          filters,
        },
        (event: StreamEvent) => {
          if (event.type === "token") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + event.content,
                };
              }
              return updated;
            });
          } else if (event.type === "sources") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = { ...last, sources: event.sources };
              }
              return updated;
            });
          } else if (event.type === "done") {
            if (event.conversation_id && !convIdRef.current) {
              convIdRef.current = event.conversation_id;
              onConversationCreated?.(event.conversation_id);
            }
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  content: event.answer || last.content,
                  sources: event.sources || last.sources,
                };
              }
              return updated;
            });
            // 获取对话详情以拿到消息 ID 和收藏状态
            if (event.conversation_id) {
              api.getConversation(event.conversation_id).then((detail) => {
                const favs: Record<string, boolean> = {};
                for (const msg of detail.messages) {
                  if (msg.id && msg.is_favorited) favs[msg.id] = true;
                }
                setFavorites(favs);
                // 将消息 ID 同步到 messages state
                setMessages((prev) =>
                  prev.map((m, i) => ({
                    ...m,
                    id: detail.messages[i]?.id ?? m.id,
                  }))
                );
              }).catch(() => {});
            }
          } else if (event.type === "error") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  content: `抱歉，出现了错误：${event.content}`,
                };
              }
              return updated;
            });
          }
        },
        controller.signal,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant") {
            updated[updated.length - 1] = {
              ...last,
              content: `抱歉，出现了错误：${err instanceof Error ? err.message : "请求失败"}`,
            };
          }
          return updated;
        });
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [input, selectedCollection, loading, useReranker, onConversationCreated]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleSources = (msgIndex: number) => {
    setExpandedSources((prev) => ({ ...prev, [msgIndex]: !prev[msgIndex] }));
  };

  const toggleFavorite = async (msgIndex: number) => {
    const msg = messages[msgIndex];
    if (!msg || msg.role !== "assistant" || !msg.id) return;
    const msgId: string = msg.id;
    const isFav = favorites[msgId];
    try {
      if (isFav) {
        await api.removeFavorite(msgId);
        setFavorites((prev) => {
          const next = { ...prev };
          delete next[msgId];
          return next;
        });
      } else {
        await api.addFavorite(msgId);
        setFavorites((prev) => ({ ...prev, [msgId]: true }));
      }
    } catch {
      // ignore
    }
  };

  const selectedName =
    collections.find((c) => c.id === selectedCollection)?.name || "选择知识库";

  const hasMessages = messages.length > 0;

  const quickActions = [
    {
      icon: FileSearch,
      title: "查询文档",
      desc: "在知识库中检索相关内容",
      prompt: "帮我查找关于 ",
    },
    {
      icon: Compass,
      title: "概念解释",
      desc: "解释知识库中的概念或术语",
      prompt: "请解释什么是 ",
    },
    {
      icon: Lightbulb,
      title: "总结要点",
      desc: "对某个主题进行要点总结",
      prompt: "请帮我总结 ",
    },
    {
      icon: CheckCircle2,
      title: "对比分析",
      desc: "比较不同方案的优缺点",
      prompt: "请对比 ",
    },
  ];

  return (
    <div className="flex flex-1 flex-col bg-white overflow-hidden">
      {/* 消息区 */}
      {hasMessages ? (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 pt-16 pb-8 space-y-6">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 animate-slide-up ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                {/* 头像 */}
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-blue-500 to-indigo-600"
                      : "bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200"
                  }`}
                >
                  {msg.role === "user" ? (
                    <User className="h-4 w-4 text-white" />
                  ) : (
                    <Bot className="h-4 w-4 text-slate-700" />
                  )}
                </div>

                {/* 消息内容 */}
                <div
                  className={`flex flex-col max-w-[85%] ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`rounded-2xl px-4 py-2.5 ${
                      msg.role === "user"
                        ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white"
                        : "bg-white border border-slate-200 text-slate-800"
                    }`}
                  >
                    <p className="text-[15px] whitespace-pre-wrap leading-relaxed">
                      <HighlightedText
                        text={msg.content}
                        terms={msg.sources?.[0]?.highlight_terms}
                      />
                    </p>
                  </div>

                  {/* 操作栏：收藏按钮 */}
                  {msg.role === "assistant" && msg.id && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <button
                        onClick={() => toggleFavorite(i)}
                        className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                          favorites[msg.id]
                            ? "text-rose-500 hover:bg-rose-50"
                            : "text-slate-400 hover:text-rose-500 hover:bg-slate-50"
                        }`}
                        title={favorites[msg.id] ? "取消收藏" : "收藏"}
                      >
                        <Heart
                          className="h-3.5 w-3.5"
                          fill={favorites[msg.id] ? "currentColor" : "none"}
                        />
                        <span>{favorites[msg.id] ? "已收藏" : "收藏"}</span>
                      </button>
                    </div>
                  )}

                  {/* 来源引用 */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 w-full">
                      <button
                        onClick={() => toggleSources(i)}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        <span>引用来源 ({msg.sources.length})</span>
                        {expandedSources[i] ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                      {expandedSources[i] && (
                        <div className="mt-2 space-y-2">
                          {msg.sources.map((source, j) => (
                            <SourceCard key={j} source={source} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>
      ) : (
        /* 空状态 — 居中提示 */
        <div className="flex-1 flex items-center justify-center px-4 pt-12">
          <div className="w-full max-w-2xl text-center">
            <h2 className="text-3xl font-semibold text-slate-900 mb-2">
              你今天想问点什么？
            </h2>
            <p className="text-sm text-slate-500">
              请先在下方选择知识库，然后输入你的问题
            </p>
          </div>
        </div>
      )}

      {/* 底部输入区 */}
      <div className="border-t border-slate-100 bg-white px-4 pb-6 pt-3">
        <div className="mx-auto w-full max-w-3xl">
          {/* 输入框 */}
          <div className="relative rounded-3xl border border-slate-200 bg-white shadow-sm focus-within:border-slate-300 focus-within:shadow-md transition-all">
            {/* 顶部行：模型选择器（左） + 重排序开关（右） */}
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              {/* 模型选择器 */}
              <div className="relative" ref={collectionMenuRef}>
                <button
                  onClick={() => setShowCollectionMenu(!showCollectionMenu)}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  <Database className="h-3.5 w-3.5 text-slate-500" />
                  <span className="font-medium max-w-[140px] truncate">{selectedName}</span>
                  <ChevronDown
                    className={`h-3 w-3 text-slate-400 transition-transform ${
                      showCollectionMenu ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {showCollectionMenu && (
                  <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-slate-200 bg-white shadow-xl py-1 z-50 max-h-72 overflow-y-auto">
                    <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      切换知识库
                    </div>
                    {collections.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-slate-500">
                        暂无可用知识库
                      </div>
                    ) : (
                      collections.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedCollection(c.id);
                            setShowCollectionMenu(false);
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-slate-100 transition-colors ${
                            selectedCollection === c.id
                              ? "bg-blue-50 text-blue-700"
                              : "text-slate-700"
                          }`}
                        >
                          <Database className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1 text-left truncate">{c.name}</span>
                          {selectedCollection === c.id && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* 重排序开关 */}
              <label className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={useReranker}
                  onChange={(e) => setUseReranker(e.target.checked)}
                  className="sr-only"
                />
                <Sparkles
                  className={`h-3.5 w-3.5 ${
                    useReranker ? "text-amber-500" : "text-slate-400"
                  }`}
                />
                <span>重排序</span>
              </label>
            </div>

            {/* 输入框 */}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                !selectedCollection
                  ? "请先选择知识库..."
                  : selectedCollection
                  ? "给 AI 助手发消息"
                  : "输入你的问题..."
              }
              rows={1}
              disabled={!selectedCollection}
              className="w-full resize-none bg-transparent px-5 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 outline-none disabled:cursor-not-allowed max-h-48"
              style={{
                minHeight: "44px",
                height: "auto",
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = `${Math.min(target.scrollHeight, 192)}px`;
              }}
            />

            {/* 底部按钮行 */}
            <div className="flex items-center justify-between px-3 pb-2">
              <button
                type="button"
                title="扩展功能"
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  title="语音输入"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                  <Mic className="h-4 w-4" />
                </button>
                {loading ? (
                  <button
                    onClick={handleStop}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-700 transition-colors"
                    title="停止生成"
                  >
                    <StopIcon className="h-3 w-3" fill="currentColor" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || !selectedCollection}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
                    title="发送消息"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 快捷操作（仅空状态显示） */}
          {!hasMessages && (
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {quickActions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => setInput(action.prompt)}
                  disabled={!selectedCollection}
                  className="group flex flex-col items-start rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-slate-300 hover:shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <action.icon className="mb-2 h-4 w-4 text-slate-500 group-hover:text-blue-600 transition-colors" />
                  <span className="text-sm font-medium text-slate-800">{action.title}</span>
                  <span className="text-[11px] text-slate-500 mt-0.5">{action.desc}</span>
                </button>
              ))}
            </div>
          )}

          <p className="mt-3 text-center text-[11px] text-slate-400">
            AI 回答仅供参考 · 重要信息请核实原始文档
          </p>
        </div>
      </div>
    </div>
  );
}
