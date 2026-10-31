import { groqStream, GROQ_MODEL } from "@/lib/ai/groq";
import { geminiStream, GEMINI_MODEL, GEMINI_LITE_MODEL } from "@/lib/ai/gemini";
import { isLocalAiError, isLocalMode, localChatModel, ollamaStream } from "@/lib/ai/ollama";
import { PROVIDERS, type AiProvider, type ResolvedModel } from "@/lib/models/registry";
import type { AiMessage } from "@/types/chat";

// Provider routing: Groq first (fast), then Gemini Flash, Gemini Flash-Lite and
// one delayed Groq retry on any failure (rate limit, missing key, outage). In
// Local Mode (OLLAMA_URL set) everything goes to the local Ollama model instead,
// with no cloud fallback. Logs which provider served each request —
// provider/model only, NEVER content.

const GROQ_RETRY_DELAY_MS = 2500;
/** What the UI suggests waiting after every provider failed. */
const AI_BUSY_RETRY_MS = 60_000;

interface GroqChunk {
  choices?: { delta?: { content?: string } }[];
}
interface GeminiChunk {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

const extractGroqText = (json: unknown): string =>
  (json as GroqChunk).choices?.[0]?.delta?.content ?? "";

const extractGeminiText = (json: unknown): string =>
  (json as GeminiChunk).candidates?.[0]?.content?.parts?.[0]?.text ?? "";

/** Parses an SSE response into a stream of plain text deltas. */
function sseTextStream(
  res: Response,
  extract: (json: unknown) => string
): ReadableStream<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<string>({
    async pull(controller) {
      // Keep reading until we enqueue text or the stream ends: a pull that
      // resolves without enqueueing is never re-invoked, which stalls the
      // stream. Reasoning models (gpt-oss) send hundreds of reasoning-only
      // chunks with no content before the answer starts.
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        let enqueued = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const text = extract(JSON.parse(payload));
            if (text) {
              controller.enqueue(text);
              enqueued = true;
            }
          } catch {
            // Partial JSON split across chunks lands back in buffer next read.
          }
        }
        if (enqueued) return;
      }
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });
}

export interface RoutedStream {
  provider: AiProvider;
  model: string;
  textStream: ReadableStream<string>;
}

interface AnthropicChunk {
  delta?: { text?: string };
}
const extractAnthropicText = (json: unknown): string =>
  (json as AnthropicChunk).delta?.text ?? "";

/** Generic OpenAI-compatible streaming call (OpenAI, OpenRouter). */
async function openAiCompatStream(
  url: string,
  apiKey: string,
  model: string,
  messages: AiMessage[],
  signal?: AbortSignal
): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.7, max_tokens: 2048 }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Provider request failed with status ${res.status}`);
  }
  return res;
}

async function anthropicStream(
  apiKey: string,
  model: string,
  messages: AiMessage[],
  signal?: AbortSignal
): Promise<Response> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      ...(system ? { system } : {}),
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Anthropic request failed with status ${res.status}`);
  }
  return res;
}

/** Routes one call to an explicitly resolved model (built-in or BYOK). */
async function resolvedStream(
  resolved: ResolvedModel,
  messages: AiMessage[],
  signal?: AbortSignal
): Promise<RoutedStream> {
  const { provider, model, apiKey } = resolved;
  let res: Response;
  let extract: (json: unknown) => string;

  switch (provider) {
    case "groq":
      res = await groqStream(messages, signal, { apiKey, model });
      extract = extractGroqText;
      break;
    case "gemini":
      res = await geminiStream(messages, signal, { apiKey, model });
      extract = extractGeminiText;
      break;
    case "anthropic":
      if (!apiKey) throw new Error("Anthropic requires a BYOK key");
      res = await anthropicStream(apiKey, model, messages, signal);
      extract = extractAnthropicText;
      break;
    case "openai":
    case "openrouter": {
      const url = PROVIDERS[provider].openAiCompatUrl!;
      if (!apiKey) throw new Error(`${provider} requires a BYOK key`);
      res = await openAiCompatStream(url, apiKey, model, messages, signal);
      extract = extractGroqText; // same OpenAI SSE shape
      break;
    }
    case "ollama":
      res = await ollamaStream(messages, signal, model);
      extract = extractGroqText; // OpenAI-compatible SSE
      break;
  }

  console.log(`[ai-router] provider=${provider} model=${model} byok=${Boolean(apiKey)}`);
  return { provider, model, textStream: sseTextStream(res, extract) };
}

export async function streamChat(
  messages: AiMessage[],
  signal?: AbortSignal,
  resolved?: ResolvedModel | null
): Promise<RoutedStream> {
  // Explicit model chosen (ModelPicker) — no fallback chain, fail honestly.
  if (resolved) return resolvedStream(resolved, messages, signal);

  // Local Mode: the on-machine model only. Falling back to a cloud provider
  // would send the conversation off the machine, which is what this mode avoids.
  if (isLocalMode()) {
    return resolvedStream({ provider: "ollama", model: localChatModel() }, messages, signal);
  }

  // Free tiers fail in bursts (Groq 429 per-minute caps, Gemini 503 "high
  // demand"), so try each pool once and give Groq one late retry after its
  // per-minute window has had a moment to recover.
  const attempts: { provider: "groq" | "gemini"; model: string; delayMs?: number }[] = [
    { provider: "groq", model: GROQ_MODEL },
    { provider: "gemini", model: GEMINI_MODEL },
    { provider: "gemini", model: GEMINI_LITE_MODEL },
    { provider: "groq", model: GROQ_MODEL, delayMs: GROQ_RETRY_DELAY_MS },
  ];
  let lastError: unknown;
  for (const attempt of attempts) {
    // Client aborted — don't burn more calls on a dead request.
    if (signal?.aborted) throw lastError ?? new Error("aborted");
    if (attempt.delayMs) await new Promise((r) => setTimeout(r, attempt.delayMs));
    try {
      const res =
        attempt.provider === "groq"
          ? await groqStream(messages, signal)
          : await geminiStream(messages, signal, { model: attempt.model });
      console.log(`[ai-router] provider=${attempt.provider} model=${attempt.model}`);
      return {
        provider: attempt.provider,
        model: attempt.model,
        textStream: sseTextStream(res, attempt.provider === "groq" ? extractGroqText : extractGeminiText),
      };
    } catch (err) {
      lastError = err;
      console.warn(
        `[ai-router] ${attempt.provider}/${attempt.model} failed (${err instanceof Error ? err.message : "unknown"})`
      );
    }
  }
  throw new AiBusyError(lastError);
}

/** Every provider in the fallback chain failed — free-tier limits, overload or an outage. */
export class AiBusyError extends Error {
  constructor(cause: unknown) {
    super("All AI providers are busy", { cause });
    this.name = "AiBusyError";
  }
}

/** Checked by name, so it holds even if the class is transpiled or duplicated. */
export function isAiBusyError(err: unknown): boolean {
  return err instanceof Error && err.name === "AiBusyError";
}

/**
 * The response for a failed AI call. "ai_busy" (whole fallback chain down) lets
 * the UI say "taking a short break" instead of a generic error; anything else
 * (e.g. a user's own BYOK key failing) stays "ai_unavailable".
 */
export function aiFailureResponse(err: unknown): Response {
  // Local Mode: Ollama not running / model not pulled — tell the developer.
  if (isLocalAiError(err)) {
    return Response.json({ error: "local_ai_offline" }, { status: 503 });
  }
  if (isAiBusyError(err)) {
    return Response.json(
      { error: "ai_busy", retryAfterMs: AI_BUSY_RETRY_MS },
      { status: 503, headers: { "Retry-After": String(AI_BUSY_RETRY_MS / 1000) } }
    );
  }
  return Response.json({ error: "ai_unavailable" }, { status: 502 });
}

/** Non-streaming completion: collects the routed stream into one string. */
export async function completeChat(
  messages: AiMessage[],
  signal?: AbortSignal,
  resolved?: ResolvedModel | null
): Promise<{ provider: AiProvider; text: string }> {
  const { provider, textStream } = await streamChat(messages, signal, resolved);
  const reader = textStream.getReader();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += value;
  }
  return { provider, text };
}

/**
 * Pulls the JSON object out of a model response that may be wrapped in
 * markdown fences or prose. Returns the raw candidate string (still needs
 * JSON.parse + zod validation by the caller).
 */
export function extractJsonObject(text: string): string {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return cleaned;
  return cleaned.slice(start, end + 1);
}

// ---------------------------------------------------------------------------
// Conversation memory: token-budget guard. ~4 chars ≈ 1 token (rough but safe
// with the margin below). Drops OLDEST non-system messages first; the system
// prompt and the newest message always survive.
// ---------------------------------------------------------------------------
const CHARS_PER_TOKEN = 4;
const DEFAULT_BUDGET_TOKENS = 6000;

export function fitToTokenBudget(
  messages: AiMessage[],
  budgetTokens: number = DEFAULT_BUDGET_TOKENS
): AiMessage[] {
  const estimate = (m: AiMessage) =>
    Math.ceil(m.content.length / CHARS_PER_TOKEN);

  const system = messages.filter((m) => m.role === "system");
  const rest = [...messages.filter((m) => m.role !== "system")];

  let total = [...system, ...rest].reduce((sum, m) => sum + estimate(m), 0);
  // Drop oldest first, but never the newest (the message being answered).
  while (total > budgetTokens && rest.length > 1) {
    const dropped = rest.shift()!;
    total -= estimate(dropped);
  }
  return [...system, ...rest];
}
