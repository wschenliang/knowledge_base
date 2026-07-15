// API 客户端封装
import type {
  AuthTokens,
  Collection,
  CollectionList,
  Document,
  DocumentList,
  ChatResponse,
  ChatRequest,
  SearchResponse,
  SearchRequest,
  User,
  StreamEvent,
  ConversationListResponse,
  ConversationDetail,
  ConversationItem,
} from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiClient {
  private token: string | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("token");
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("token", token);
      } else {
        localStorage.removeItem("token");
      }
    }
  }

  getToken(): string | null {
    return this.token;
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // 认证
  async register(username: string, password: string, displayName?: string): Promise<AuthTokens> {
    const result = await this.request<AuthTokens>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, display_name: displayName }),
    });
    this.setToken(result.access_token);
    return result;
  }

  async login(username: string, password: string): Promise<AuthTokens> {
    const result = await this.request<AuthTokens>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    this.setToken(result.access_token);
    return result;
  }

  async getMe(): Promise<User> {
    return this.request<User>("/api/v1/auth/me");
  }

  // 知识库集合
  async listCollections(): Promise<CollectionList> {
    return this.request<CollectionList>("/api/v1/collections");
  }

  async getCollection(id: string): Promise<Collection> {
    return this.request<Collection>(`/api/v1/collections/${id}`);
  }

  async createCollection(name: string, description?: string): Promise<Collection> {
    return this.request<Collection>("/api/v1/collections", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    });
  }

  // 文档
  async listDocuments(collectionId?: string): Promise<DocumentList> {
    const params = collectionId ? `?collection_id=${collectionId}` : "";
    return this.request<DocumentList>(`/api/v1/documents${params}`);
  }

  async getDocument(id: string): Promise<Document> {
    return this.request<Document>(`/api/v1/documents/${id}`);
  }

  async uploadDocument(collectionId: string, file: File): Promise<Document> {
    const formData = new FormData();
    formData.append("collection_id", collectionId);
    formData.append("file", file);

    const headers: Record<string, string> = {};
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${BASE_URL}/api/v1/documents/upload`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async deleteDocument(id: string): Promise<void> {
    return this.request<void>(`/api/v1/documents/${id}`, {
      method: "DELETE",
    });
  }

  // 问答
  async chat(request: ChatRequest): Promise<ChatResponse> {
    return this.request<ChatResponse>("/api/v1/chat", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  // 搜索
  async search(request: SearchRequest): Promise<SearchResponse> {
    return this.request<SearchResponse>("/api/v1/search", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  // 流式问答 (SSE)
  async chatStream(
    request: ChatRequest,
    onEvent: (event: StreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${BASE_URL}/api/v1/chat/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("无法读取响应流");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 按双换行分割 SSE 事件
      const parts = buffer.split("\n\n");
      // 最后一个可能不完整，保留到下一次
      buffer = parts.pop() || "";

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const jsonStr = trimmed.slice(6);
        try {
          const event = JSON.parse(jsonStr) as StreamEvent;
          onEvent(event);
        } catch {
          // 忽略无法解析的事件
        }
      }
    }

    // 处理剩余 buffer
    if (buffer.trim().startsWith("data: ")) {
      try {
        const event = JSON.parse(buffer.trim().slice(6)) as StreamEvent;
        onEvent(event);
      } catch {
        // ignore
      }
    }
  }

  // 对话历史
  async listConversations(collectionId?: string): Promise<ConversationListResponse> {
    const params = collectionId ? `?collection_id=${collectionId}` : "";
    return this.request<ConversationListResponse>(`/api/v1/chat/conversations${params}`);
  }

  async getConversation(id: string): Promise<ConversationDetail> {
    return this.request<ConversationDetail>(`/api/v1/chat/conversations/${id}`);
  }

  async deleteConversation(id: string): Promise<void> {
    return this.request<void>(`/api/v1/chat/conversations/${id}`, { method: "DELETE" });
  }

  async renameConversation(id: string, title: string): Promise<ConversationItem> {
    return this.request<ConversationItem>(`/api/v1/chat/conversations/${id}`, {
      method: "PUT",
      body: JSON.stringify({ title }),
    });
  }
}

export const api = new ApiClient();
