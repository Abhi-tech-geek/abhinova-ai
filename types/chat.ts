// Shared chat interfaces (see CLAUDE.md: all shared types live in /types).
import type { RetrievedSource } from "./documents";

export type ChatRole = "user" | "assistant" | "system";

/** Message shape sent to LLM providers. */
export interface AiMessage {
  role: ChatRole;
  content: string;
}

/** messages table row as used by the UI. */
export interface ChatMessageRecord {
  id: string;
  role: ChatRole;
  content: string;
  created_at: string;
  /** Project chats store the cited sources with the assistant reply. */
  metadata?: { sources?: RetrievedSource[] } | null;
}

/** conversations table row as used by the UI. */
export interface ConversationRecord {
  id: string;
  title: string;
  mode: "workspace" | "qa" | "wellness";
  updated_at: string;
}
