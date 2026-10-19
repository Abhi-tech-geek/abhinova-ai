import type { AiMessage } from "@/types/chat";

// Groq chat-completion client (primary LLM). SERVER-ONLY — never import from
// client components (see CLAUDE.md: AI calls only in server-side code).
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// qwen/qwen3.8-27b was faster but its free-tier output-tokens-per-minute cap
// rejects our 2048-token requests intermittently — gpt-oss-120b is reliable.
export const GROQ_MODEL = "openai/gpt-oss-120b";

/**
 * Starts a streaming chat completion; returns the raw SSE Response.
 * `overrides` support BYOK routing (user's key) and model selection.
 */
export async function groqStream(
  messages: AiMessage[],
  signal?: AbortSignal,
  overrides?: { apiKey?: string; model?: string }
): Promise<Response> {
  const apiKey = overrides?.apiKey ?? process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: overrides?.model ?? GROQ_MODEL,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 2048,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    // Never log response bodies here — they can echo request content.
    throw new Error(`Groq request failed with status ${res.status}`);
  }
  return res;
}
