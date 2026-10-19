import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkBlocks } from "@/lib/rag/chunk";
import { embedDocuments } from "@/lib/ai/embeddings";
import { redactSecrets } from "@/lib/code/secret-scan";
import type { ExtractedBlock } from "@/types/documents";

// THE single chunk → redact → embed → store pipeline. Uploaded files and every
// connector/URL source (via lib/connectors/normalize.ts) end up here — never
// write a second RAG pipeline.

const INSERT_BATCH = 100;
/** Free-tier discipline: one document can't flood the vector table. */
export const MAX_CHUNKS_PER_DOCUMENT = 400;

export interface IngestResult {
  chunkCount: number;
  redactedSecrets: number;
  truncated: boolean;
}

export async function ingestBlocks(
  supabase: SupabaseClient,
  params: { userId: string; documentId: string; blocks: ExtractedBlock[] }
): Promise<IngestResult> {
  let redactedSecrets = 0;
  const safeBlocks = params.blocks.map((block) => {
    const { text, redacted } = redactSecrets(block.text);
    redactedSecrets += redacted;
    return { ...block, text };
  });

  let chunks = chunkBlocks(safeBlocks);
  if (chunks.length === 0) throw new Error("No readable text found in this file");
  const truncated = chunks.length > MAX_CHUNKS_PER_DOCUMENT;
  if (truncated) chunks = chunks.slice(0, MAX_CHUNKS_PER_DOCUMENT);

  const embeddings = await embedDocuments(chunks.map((c) => c.content));

  // Re-processing / re-sync safety: replace this document's chunks entirely.
  await supabase.from("document_chunks").delete().eq("document_id", params.documentId);

  for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
    const batch = chunks.slice(i, i + INSERT_BATCH).map((chunk, j) => ({
      document_id: params.documentId,
      user_id: params.userId,
      content: chunk.content,
      embedding: embeddings[i + j],
      chunk_index: chunk.chunkIndex,
      metadata: chunk.metadata,
    }));
    const { error } = await supabase.from("document_chunks").insert(batch);
    if (error) throw new Error("Could not save the processed chunks");
  }

  return { chunkCount: chunks.length, redactedSecrets, truncated };
}
