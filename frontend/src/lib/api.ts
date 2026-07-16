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
  CollectionMember,
  CollectionMemberListResponse,
  InviteMemberRequest,
  UpdateMemberRoleRequest,
  TransferOwnershipRequest,
  TransferOwnershipResponse,
  AuditLogItem,
  AuditLogListResponse,
  AuditLogQueryParams,
  PreviewResponse,
  DashboardStats,
  Tag,
  TagListResponse,
  FavoriteItem,
  FavoriteListResponse,
  UserListItem,
  UserListResponse,
  UserUpdateRequest,
  UserDetailResponse,
  UserStats,
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
  async listCollections(tags?: string[]): Promise<CollectionList> {
    const params = tags && tags.length > 0
      ? `?${tags.map(t => `tag=${encodeURIComponent(t)}`).join("&")}`
      : "";
    return this.request<CollectionList>(`/api/v1/collections${params}`);
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

  // 文档预览
  async downloadDocument(id: string): Promise<ArrayBuffer> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${BASE_URL}/api/v1/documents/${id}/download`, {
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.arrayBuffer();
  }

  async previewDocument(id: string): Promise<PreviewResponse> {
    return this.request<PreviewResponse>(`/api/v1/documents/${id}/preview`);
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

  // ===== ACL 细粒度权限管理 =====

  async listCollectionMembers(collectionId: string): Promise<CollectionMemberListResponse> {
    return this.request<CollectionMemberListResponse>(
      `/api/v1/collections/${collectionId}/acl`
    );
  }

  async inviteCollectionMember(
    collectionId: string,
    data: InviteMemberRequest,
  ): Promise<CollectionMember> {
    return this.request<CollectionMember>(
      `/api/v1/collections/${collectionId}/acl`,
      { method: "POST", body: JSON.stringify(data) },
    );
  }

  async updateCollectionMemberRole(
    collectionId: string,
    userId: string,
    data: UpdateMemberRoleRequest,
  ): Promise<CollectionMember> {
    return this.request<CollectionMember>(
      `/api/v1/collections/${collectionId}/acl/${userId}`,
      { method: "PUT", body: JSON.stringify(data) },
    );
  }

  async removeCollectionMember(
    collectionId: string,
    userId: string,
  ): Promise<void> {
    return this.request<void>(
      `/api/v1/collections/${collectionId}/acl/${userId}`,
      { method: "DELETE" },
    );
  }

  async transferCollectionOwnership(
    collectionId: string,
    data: TransferOwnershipRequest,
  ): Promise<TransferOwnershipResponse> {
    return this.request<TransferOwnershipResponse>(
      `/api/v1/collections/${collectionId}/acl/transfer`,
      { method: "POST", body: JSON.stringify(data) },
    );
  }

  // ===== 标签管理 =====

  async listTags(): Promise<TagListResponse> {
    return this.request<TagListResponse>("/api/v1/tags");
  }

  async createTag(name: string, color?: string): Promise<Tag> {
    return this.request<Tag>("/api/v1/tags", {
      method: "POST",
      body: JSON.stringify({ name, color }),
    });
  }

  async updateTag(id: string, data: { name?: string; color?: string }): Promise<Tag> {
    return this.request<Tag>(`/api/v1/tags/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteTag(id: string): Promise<void> {
    return this.request<void>(`/api/v1/tags/${id}`, {
      method: "DELETE",
    });
  }

  async getCollectionTags(collectionId: string): Promise<Tag[]> {
    return this.request<Tag[]>(`/api/v1/collections/${collectionId}/tags`);
  }

  async setCollectionTags(collectionId: string, tagIds: string[]): Promise<Tag[]> {
    return this.request<Tag[]>(`/api/v1/collections/${collectionId}/tags`, {
      method: "PUT",
      body: JSON.stringify({ tag_ids: tagIds }),
    });
  }

  // ===== Admin 审计日志 =====

  async listAuditLogs(params: AuditLogQueryParams = {}): Promise<AuditLogListResponse> {
    const qs = new URLSearchParams();
    if (params.user_id) qs.set("user_id", params.user_id);
    if (params.action) qs.set("action", params.action);
    if (params.resource_type) qs.set("resource_type", params.resource_type);
    if (params.resource_id) qs.set("resource_id", params.resource_id);
    if (params.start_time) qs.set("start_time", params.start_time);
    if (params.end_time) qs.set("end_time", params.end_time);
    if (params.keyword) qs.set("keyword", params.keyword);
    if (params.skip !== undefined) qs.set("skip", String(params.skip));
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return this.request<AuditLogListResponse>(
      `/api/v1/admin/audit-logs${query ? `?${query}` : ""}`,
    );
  }

  async exportAuditLogs(params: AuditLogQueryParams = {}): Promise<Blob> {
    const qs = new URLSearchParams();
    if (params.user_id) qs.set("user_id", params.user_id);
    if (params.action) qs.set("action", params.action);
    if (params.resource_type) qs.set("resource_type", params.resource_type);
    if (params.resource_id) qs.set("resource_id", params.resource_id);
    if (params.start_time) qs.set("start_time", params.start_time);
    if (params.end_time) qs.set("end_time", params.end_time);
    if (params.keyword) qs.set("keyword", params.keyword);
    const query = qs.toString();

    const headers: Record<string, string> = {};
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(
      `${BASE_URL}/api/v1/admin/audit-logs/export${query ? `?${query}` : ""}`,
      { headers },
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }
    return response.blob();
  }

  // ===== Dashboard =====

  async getDashboardStats(days: number = 7): Promise<DashboardStats> {
    return this.request<DashboardStats>(`/api/v1/dashboard/stats?days=${days}`);
  }

  // ===== 用户管理 (Admin) =====

  async getUserStats(): Promise<UserStats> {
    return this.request<UserStats>("/api/v1/admin/users/stats");
  }

  async listUsers(params: {
    keyword?: string;
    role?: string;
    is_active?: boolean;
    skip?: number;
    limit?: number;
  } = {}): Promise<UserListResponse> {
    const qs = new URLSearchParams();
    if (params.keyword) qs.set("keyword", params.keyword);
    if (params.role) qs.set("role", params.role);
    if (params.is_active !== undefined) qs.set("is_active", String(params.is_active));
    if (params.skip !== undefined) qs.set("skip", String(params.skip));
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return this.request<UserListResponse>(
      `/api/v1/admin/users${query ? `?${query}` : ""}`
    );
  }

  async getUserDetail(userId: string): Promise<UserDetailResponse> {
    return this.request<UserDetailResponse>(`/api/v1/admin/users/${userId}`);
  }

  async updateUser(userId: string, data: UserUpdateRequest): Promise<UserDetailResponse> {
    return this.request<UserDetailResponse>(`/api/v1/admin/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async toggleUserStatus(userId: string): Promise<{ id: string; is_active: boolean; message: string }> {
    return this.request<{ id: string; is_active: boolean; message: string }>(
      `/api/v1/admin/users/${userId}/toggle-status`,
      { method: "POST" }
    );
  }

  async resetUserPassword(userId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(
      `/api/v1/admin/users/${userId}/reset-password`,
      { method: "POST" }
    );
  }

  async resetPassword(token: string, new_password: string): Promise<{ message: string }> {
    return this.request<{ message: string }>("/api/v1/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password }),
    });
  }

  // ===== 收藏 =====

  async addFavorite(messageId: string, note?: string): Promise<FavoriteItem> {
    return this.request<FavoriteItem>("/api/v1/favorites", {
      method: "POST",
      body: JSON.stringify({ message_id: messageId, note }),
    });
  }

  async removeFavorite(messageId: string): Promise<void> {
    return this.request<void>(`/api/v1/favorites/${messageId}`, {
      method: "DELETE",
    });
  }

  async listFavorites(params?: {
    collection_id?: string;
    keyword?: string;
    skip?: number;
    limit?: number;
  }): Promise<FavoriteListResponse> {
    const qs = new URLSearchParams();
    if (params?.collection_id) qs.set("collection_id", params.collection_id);
    if (params?.keyword) qs.set("keyword", params.keyword);
    if (params?.skip !== undefined) qs.set("skip", String(params.skip));
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return this.request<FavoriteListResponse>(
      `/api/v1/favorites${query ? `?${query}` : ""}`
    );
  }

  async updateFavoriteNote(messageId: string, note: string): Promise<void> {
    return this.request<void>(`/api/v1/favorites/${messageId}/note`, {
      method: "PUT",
      body: JSON.stringify({ note }),
    });
  }

  async checkFavorites(messageIds: string[]): Promise<Record<string, boolean>> {
    if (messageIds.length === 0) return {};
    return this.request<Record<string, boolean>>(
      `/api/v1/favorites/check?message_ids=${messageIds.join(",")}`
    );
  }
}

export const api = new ApiClient();
