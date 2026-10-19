import type { AiMessage } from "@/types/chat";

// Google Gemini client (fallback LLM; embeddings come in the RAG session).
// SERVER-ONLY — never import from client components.
// "-latest" alias tracks Google's current Flash, so retirements of pinned
// versions (2.0 / 2.5 were both pulled) don't break the fallback again.
export const GEMINI_MODEL = "gemini-flash-latest";

/**
 * Starts a streaming generation; returns the raw SSE Response.
 * `overrides` support BYOK routing (user's key) and model selection.
 */
export async function geminiStream(
  messages: AiMessage[],
  signal?: AbortSignal,
  overrides?: { apiKey?: string; model?: string }
): Promise<Response> {
  const apiKey = overrides?.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const model = overrides?.model ?? GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      // Key goes in a header, not the URL, so it never lands in access logs.
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents,
      ...(systemText
        ? { systemInstruction: { parts: [{ text: systemText }] } }
        : {}),
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
        // Current Flash "thinks" by default (~10s, and thinking tokens eat the
        // 2048 output budget, truncating JSON). Fallback must be fast.
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Gemini request failed with status ${res.status}`);
  }
  return res;
}
