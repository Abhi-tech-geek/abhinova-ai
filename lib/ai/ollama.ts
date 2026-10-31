import type { AiMessage } from "@/types/chat";

// Local Mode: chat + embeddings from Ollama running on the developer's own
// machine. SERVER-ONLY. On only when OLLAMA_URL is set — never on Vercel, where
// a serverless function has no GPU and can't reach anyone's localhost.
// In Local Mode nothing falls back to a cloud model: the point is privacy.

const DEFAULT_CHAT_MODEL = "llama3.2";
// nomic-embed-text returns 768 dims, the size of the vector(768) column.
const DEFAULT_EMBED_MODEL = "nomic-embed-text";
const EMBED_DIMENSIONS = 768;
const EMBED_BATCH_SIZE = 32;

export function isLocalMode(): boolean {
  return Boolean(process.env.OLLAMA_URL?.trim());
}

export function localChatModel(): string {
  return process.env.OLLAMA_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL;
}

function localEmbedModel(): string {
  return process.env.OLLAMA_EMBED_MODEL?.trim() || DEFAULT_EMBED_MODEL;
}

function baseUrl(): string {
  return (process.env.OLLAMA_URL ?? "").trim().replace(/\/+$/, "");
}

/** Ollama isn't running, the model isn't pulled, or it errored. */
export class LocalAiError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "LocalAiError";
  }
}

export function isLocalAiError(err: unknown): boolean {
  return err instanceof Error && err.name === "LocalAiError";
}

async function call(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new LocalAiError(`Ollama is not reachable at ${baseUrl()}`, err);
  }
  if (!res.ok) {
    // 404 = model not pulled ("ollama pull <model>").
    throw new LocalAiError(`Ollama request failed with status ${res.status}`);
  }
  return res;
}

/** Streaming chat via Ollama's OpenAI-compatible endpoint (same SSE shape as Groq). */
export async function ollamaStream(
  messages: AiMessage[],
  signal?: AbortSignal,
  model = localChatModel()
): Promise<Response> {
  const res = await call(
    "/v1/chat/completions",
    { model, messages, stream: true, temperature: 0.7, max_tokens: 2048 },
    signal
  );
  if (!res.body) throw new LocalAiError("Ollama returned an empty stream");
  return res;
}

/**
 * Embeddings via Ollama. nomic-embed-text expects a task prefix, so documents
 * and queries are embedded as "search_document: …" / "search_query: …".
 */
export async function ollamaEmbed(texts: string[], kind: "document" | "query"): Promise<number[][]> {
  const prefix = kind === "document" ? "search_document: " : "search_query: ";
  const all: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const res = await call("/api/embed", { model: localEmbedModel(), input: batch.map((t) => prefix + t) });
    const data = (await res.json()) as { embeddings?: number[][] };
    const vectors = data.embeddings ?? [];
    if (vectors.length !== batch.length || vectors.some((v) => v.length !== EMBED_DIMENSIONS)) {
      throw new LocalAiError(
        `Local embeddings must be ${EMBED_DIMENSIONS}-dimensional (use nomic-embed-text)`
      );
    }
    all.push(...vectors);
  }
  return all;
}
