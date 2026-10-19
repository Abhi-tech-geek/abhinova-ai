import { embedQuery } from "@/lib/ai/embeddings";
import { createClient } from "@/lib/supabase/server";
import { describeChunkLocation } from "@/lib/utils";
import type { ChunkMetadata, RetrievedSource } from "@/types/documents";

// Retrieval for chat-with-documents and project chats. Uses the
// match_document_chunks RPC (SECURITY INVOKER → RLS applies, so only the
// caller's chunks ever match; p_project_id narrows to one project).

const MATCH_COUNT = 6;

interface MatchRow {
  id: string;
  document_id: string;
  file_name: string;
  source_url?: string | null;
  content: string;
  chunk_index: number;
  metadata: ChunkMetadata | null;
  similarity: number | null;
}

/**
 * Semantic retrieval: embed the question, ANN-search the user's chunks —
 * optionally restricted to specific documents and/or one project.
 */
export async function retrieveChunks(
  question: string,
  documentIds: string[] | null,
  projectId: string | null = null,
  matchCount = MATCH_COUNT
): Promise<RetrievedSource[]> {
  const queryEmbedding = await embedQuery(question);
  const supabase = createClient();
  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    filter_document_ids: documentIds && documentIds.length > 0 ? documentIds : null,
    p_project_id: projectId,
  });
  if (error) throw new Error(`Retrieval failed: ${error.message}`);
  return toSources((data ?? []) as MatchRow[]);
}

/** First chunks of one document in reading order (used by Summarize). */
export async function firstChunks(
  documentId: string,
  limit = 8
): Promise<RetrievedSource[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("document_chunks")
    .select("id, document_id, content, chunk_index, metadata, documents(file_name, source_url)")
    .eq("document_id", documentId)
    .order("chunk_index", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Chunk fetch failed: ${error.message}`);

  return toSources(
    (data ?? []).map((row) => {
      const doc = row.documents as unknown as { file_name: string; source_url: string | null } | null;
      return {
        id: row.id as string,
        document_id: row.document_id as string,
        file_name: doc?.file_name ?? "document",
        source_url: doc?.source_url ?? null,
        content: row.content as string,
        chunk_index: row.chunk_index as number,
        metadata: (row.metadata ?? {}) as ChunkMetadata,
        similarity: null,
      };
    })
  );
}

function toSources(rows: MatchRow[]): RetrievedSource[] {
  return rows.map((row, i) => ({
    tag: `S${i + 1}`,
    id: row.id,
    documentId: row.document_id,
    fileName: row.file_name,
    sourceUrl: row.source_url ?? null,
    content: row.content,
    metadata: row.metadata ?? {},
    similarity: row.similarity,
  }));
}

/**
 * Builds the prompt context block. Prompt-injection defense per CLAUDE.md:
 * chunks are wrapped in <document_content> delimiters and the system prompt
 * tells the model this is untrusted data, never instructions.
 */
export function buildDocumentContext(sources: RetrievedSource[]): string {
  return sources
    .map((s) => {
      const where = describeChunkLocation(s.metadata);
      return `[${s.tag}] ${s.fileName}${where ? `, ${where}` : ""}\n<document_content>\n${s.content}\n</document_content>`;
    })
    .join("\n\n");
}
