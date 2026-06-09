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
