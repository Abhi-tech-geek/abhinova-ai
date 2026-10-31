// Embedding generation via Gemini gemini-embedding-001, truncated to 768 dims
// (outputDimensionality) to match the vector(768) column. SERVER-ONLY.
// Batched with retry + exponential backoff. In Local Mode (OLLAMA_URL set) the
// local nomic-embed-text model is used instead — also 768 dims. Vectors from
// the two models aren't comparable, so documents processed in one mode are
// only searchable in that mode (re-process to switch).

import { isLocalMode, ollamaEmbed } from "@/lib/ai/ollama";

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;

const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}`;
const BATCH_SIZE = 100; // Gemini batchEmbedContents limit
const MAX_ATTEMPTS = 3;

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // 1s → 2s → give up
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastError;
}

interface BatchEmbedResponse {
  embeddings?: { values?: number[] }[];
}
interface EmbedResponse {
  embedding?: { values?: number[] };
}

/** Embeds document chunks (RETRIEVAL_DOCUMENT task type), preserving order. */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (isLocalMode()) return ollamaEmbed(texts, "document");
  const apiKey = getApiKey();
  const all: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const result = await withRetry(async () => {
      const res = await fetch(`${BASE_URL}:batchEmbedContents`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
            taskType: "RETRIEVAL_DOCUMENT",
            outputDimensionality: EMBEDDING_DIMENSIONS,
          })),
        }),
      });
      if (!res.ok) throw new Error(`Embedding batch failed with status ${res.status}`);
      return (await res.json()) as BatchEmbedResponse;
    });

    const vectors = (result.embeddings ?? []).map((e) => e.values ?? []);
    if (vectors.length !== batch.length || vectors.some((v) => v.length !== EMBEDDING_DIMENSIONS)) {
      throw new Error("Embedding response shape mismatch");
    }
    all.push(...vectors);
  }
  return all;
}

/** Embeds a search query (RETRIEVAL_QUERY task type). */
export async function embedQuery(text: string): Promise<number[]> {
  if (isLocalMode()) return (await ollamaEmbed([text], "query"))[0];
  const apiKey = getApiKey();
  const result = await withRetry(async () => {
    const res = await fetch(`${BASE_URL}:embedContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: EMBEDDING_DIMENSIONS,
      }),
    });
    if (!res.ok) throw new Error(`Query embedding failed with status ${res.status}`);
    return (await res.json()) as EmbedResponse;
  });
  const values = result.embedding?.values ?? [];
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error("Query embedding shape mismatch");
  }
  return values;
}
