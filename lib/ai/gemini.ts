import type { AiMessage } from "@/types/chat";

// Google Gemini client (fallback LLM; embeddings come in the RAG session).
// SERVER-ONLY — never import from client components.
// "-latest" alias tracks Google's current Flash, so retirements of pinned
// versions (2.0 / 2.5 were both pulled) don't break the fallback again.
export const GEMINI_MODEL = "gemini-flash-latest";
/** Second fallback: separate capacity pool, so it often works while Flash is overloaded. */
export const GEMINI_LITE_MODEL = "gemini-flash-lite-latest";
const CONNECT_TIMEOUT_MS = 15_000;

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

  // An overloaded model can take 20s+ just to return a 503. Give up on the
  // first byte after a while so the router can try the next provider; the
  // timer is cleared once headers arrive, so long streams aren't cut off.
  const connect = new AbortController();
  const timer = setTimeout(() => connect.abort(), CONNECT_TIMEOUT_MS);
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
        // Room for long structured QA output (API test suites run ~3k tokens).
        maxOutputTokens: 4096,
        // Current Flash "thinks" by default (~10s, and thinking tokens eat the
        // output budget, truncating JSON). Fallback must be fast. Lite is a
        // Gemini 3.x model: it rejects thinkingBudget and takes a level.
        thinkingConfig: model.includes("lite") ? { thinkingLevel: "minimal" } : { thinkingBudget: 0 },
      },
    }),
    signal: signal ? AbortSignal.any([signal, connect.signal]) : connect.signal,
  }).finally(() => clearTimeout(timer));

  if (!res.ok || !res.body) {
    throw new Error(`Gemini request failed with status ${res.status}`);
  }
  return res;
}
