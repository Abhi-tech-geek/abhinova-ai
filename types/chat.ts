// Shared chat interfaces (see CLAUDE.md: all shared types live in /types).
import type { RetrievedSource } from "./documents";

export type ChatRole = "user" | "assistant" | "system";

/** Message shape sent to LLM providers. */
export interface AiMessage {
  role: ChatRole;
  content: string;
}

/** One tool call made by Agent Mode, as shown above the reply. */
export interface AgentStep {
  /** "fallback" = tools were unavailable, so the reply was written without them. */
  tool: "wikipedia_search" | "read_webpage" | "search_my_documents" | "calculator" | "current_time" | "fallback";
  /** Short human label, e.g. 'Searched Wikipedia for "ISRO"'. */
  label: string;
  ok: boolean;
}

/** messages table row as used by the UI. */
export interface ChatMessageRecord {
  id: string;
  role: ChatRole;
  content: string;
  created_at: string;
  /** Project chats store the cited sources; Agent Mode also stores its steps. */
  metadata?: { sources?: RetrievedSource[]; steps?: AgentStep[] } | null;
}

/** conversations table row as used by the UI. */
export interface ConversationRecord {
  id: string;
  title: string;
  mode: "workspace" | "qa" | "wellness";
  updated_at: string;
}
