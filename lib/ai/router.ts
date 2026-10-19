import { groqStream, GROQ_MODEL } from "@/lib/ai/groq";
import { geminiStream, GEMINI_MODEL } from "@/lib/ai/gemini";
import { PROVIDERS, type Provider, type ResolvedModel } from "@/lib/models/registry";
import type { AiMessage } from "@/types/chat";

// Provider routing: Groq first (fast), automatic Gemini fallback on any Groq
// failure (rate limit, missing key, outage). Logs which provider served each
// request — provider/model only, NEVER message content.

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
  provider: Provider;
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

  try {
    const res = await groqStream(messages, signal);
    console.log(`[ai-router] provider=groq model=${GROQ_MODEL}`);
    return {
      provider: "groq",
      model: GROQ_MODEL,
      textStream: sseTextStream(res, extractGroqText),
    };
  } catch (err) {
    // Client aborted — don't burn a Gemini call on a dead request.
    if (signal?.aborted) throw err;
    console.warn(
      `[ai-router] groq failed (${err instanceof Error ? err.message : "unknown"}); falling back to gemini`
    );
    const res = await geminiStream(messages, signal);
    console.log(`[ai-router] provider=gemini model=${GEMINI_MODEL}`);
    return {
      provider: "gemini",
      model: GEMINI_MODEL,
      textStream: sseTextStream(res, extractGeminiText),
    };
  }
}

/** Non-streaming completion: collects the routed stream into one string. */
export async function completeChat(
  messages: AiMessage[],
  signal?: AbortSignal,
  resolved?: ResolvedModel | null
): Promise<{ provider: Provider; text: string }> {
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
