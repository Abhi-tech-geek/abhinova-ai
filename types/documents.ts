// Shared document/RAG interfaces (see CLAUDE.md: all shared types in /types).

export type DocumentStatus = "processing" | "ready" | "failed";

/** documents table row as used by the UI. */
export interface DocumentRecord {
  id: string;
  file_name: string;
  file_type: string;
  storage_path: string | null;
  status: DocumentStatus;
  created_at: string;
  project_id?: string | null;
  source_url?: string | null;
  /** Set when the document was indexed in the other mode, so search here skips it. */
  indexedIn?: "online" | "local";
}

/**
 * Provenance stored per chunk so citations point at a real location:
 * { page: 3 } / { slide: 2 } / { sheet: "Q1", rows: "12–40" } /
 * { heading: "Scope" } / { path: "src/app.ts", language: "ts" } /
 * { issueKey: "PROJ-123" }.
 */
export interface ChunkMetadata {
  page?: number;
  slide?: number;
  sheet?: string;
  rows?: string;
  heading?: string;
  path?: string;
  language?: string;
  issueKey?: string;
  /** Embedding model that indexed this chunk (absent = the cloud model). */
  embedModel?: string;
}

/** One extracted block of text before chunking (a page, a slide, or a whole file). */
export interface ExtractedBlock {
  text: string;
  metadata: ChunkMetadata;
}

/** Chunk ready for embedding + insert. */
export interface DocumentChunkInput {
  content: string;
  chunkIndex: number;
  metadata: ChunkMetadata;
}

/** A retrieved chunk returned to the client as a citable source. */
export interface RetrievedSource {
  tag: string; // "S1", "S2", …
  id: string;
  documentId: string;
  fileName: string;
  sourceUrl?: string | null;
  content: string;
  metadata: ChunkMetadata;
  similarity: number | null;
}

/**
 * Source check for one cited statement in an answer (POST /api/documents/verify):
 * "supported" = the cited passage says it, "partial" = only part of it or a
 * detail differs, "unsupported" = the passage doesn't say it (or contradicts
 * it), "missing" = it cites a source that wasn't part of the answer,
 * "unchecked" = the judge gave no verdict for it.
 */
export interface CitationCheck {
  claim: string;
  tags: string[];
  status: "supported" | "partial" | "unsupported" | "missing" | "unchecked";
  note?: string;
}

/** "How this answer was made" — real numbers from each RAG stage. */
export interface AnswerTrace {
  mode: "ask" | "summarize";
  documents: { fileName: string; chunks: number }[];
  embedModel: string;
  passagesUsed: number;
  topSimilarity: number | null;
  contextChars: number;
  answerProvider: string;
  timingsMs: { search: number; answer: number };
}
