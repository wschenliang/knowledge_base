// 前端类型定义

export interface User {
  id: string;
  username: string;
  email?: string;
  display_name?: string;
  role: string;
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
  user_id: string;
  username: string;
  role: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  qdrant_collection: string;
  is_public: boolean;
  owner_id?: string;
  document_count: number;
  created_at: string;
  updated_at: string;
  my_role?: "owner" | "editor" | "viewer"; // 当前用户对此 KB 的 ACL 角色
}

export interface CollectionList {
  items: Collection[];
  total: number;
}

export interface Document {
  id: string;
  collection_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  title?: string;
  chunk_count: number;
  status: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentList {
  items: Document[];
  total: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: SourceItem[];
}

export interface SourceItem {
  index: number;
  source: string;
  text: string;
  score: number;
}

export interface ChatRequest {
  query: string;
  collection_id: string;
  conversation_id?: string;
  top_k?: number;
  use_reranker?: boolean;
}

export interface ChatResponse {
  answer: string;
  sources: SourceItem[];
  conversation_id: string;
}

export interface SearchRequest {
  query: string;
  collection_id: string;
  top_k?: number;
  use_reranker?: boolean;
}

export interface SearchResult {
  index: number;
  source: string;
  text: string;
  score: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
}

// SSE 流式事件
export type StreamEvent =
  | { type: "sources"; sources: SourceItem[] }
  | { type: "token"; content: string }
  | { type: "done"; answer: string; sources: SourceItem[]; conversation_id: string }
  | { type: "error"; content: string };

// 对话历史
export interface ConversationItem {
  id: string;
  collection_id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationListResponse {
  items: ConversationItem[];
  total: number;
}

export interface ConversationDetail extends ConversationItem {
  messages: ChatMessage[];
}

// ===== ACL 细粒度权限 =====
export type AclRole = "owner" | "editor" | "viewer";

export interface CollectionMember {
  id: string;
  user_id: string;
  username: string;
  display_name?: string | null;
  role: AclRole;
  granted_by?: string | null;
  created_at: string;
}

export interface CollectionMemberListResponse {
  items: CollectionMember[];
  total: number;
}

export interface InviteMemberRequest {
  username: string;
  role: "editor" | "viewer";
}

export interface UpdateMemberRoleRequest {
  role: AclRole;
}

export interface TransferOwnershipRequest {
  new_owner_username: string;
}

export interface TransferOwnershipResponse {
  old_owner_id: string;
  new_owner_id: string;
  collection_id: string;
}

// ===== 审计日志 =====
export interface AuditLogItem {
  id: number;
  user_id?: string | null;
  username?: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  detail?: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at: string;
}

export interface AuditLogListResponse {
  items: AuditLogItem[];
  total: number;
}

export interface AuditLogQueryParams {
  user_id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  skip?: number;
  limit?: number;
}

// ===== 文档预览 =====

export interface PreviewResponse {
  content: string;
  format: string;
}

// ===== Dashboard 统计 =====

export interface DashboardKPI {
  total_users: number;
  total_collections: number;
  total_documents: number;
  total_conversations: number;
  total_messages: number;
  today_messages: number;
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface DashboardTrends {
  daily_messages: DailyCount[];
  daily_documents: DailyCount[];
}

export interface TopCollectionItem {
  id: string;
  name: string;
  question_count: number;
  document_count: number;
  owner_username?: string | null;
}

export interface TopUserItem {
  user_id: string;
  username: string;
  display_name?: string | null;
  message_count: number;
  conversation_count: number;
}

export interface TopQuestionItem {
  query: string;
  count: number;
  last_asked_at?: string | null;
}

export interface DashboardStats {
  scope: "admin" | "user";
  range_days: number;
  generated_at: string;
  kpi: DashboardKPI;
  trends: DashboardTrends;
  top_collections: TopCollectionItem[];
  top_users: TopUserItem[] | null;
  top_questions: TopQuestionItem[];
}
