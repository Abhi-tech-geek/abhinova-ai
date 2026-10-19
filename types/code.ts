// Shared Code Studio types — inferred from lib/validators/code where possible.
export type {
  CodeFile,
  CodeChatRequest,
  CodeEditRequest,
  CodeEditOutput,
  CodeDocsRequest,
} from "@/lib/validators/code";

/** One entry in the connected project's file map (client-side only). */
export interface ProjectFileEntry {
  path: string;
  size: number;
  /** File System Access handle — never leaves the browser. */
  handle: FileSystemFileHandle;
}

/** A file skipped during indexing, with the reason shown to the user. */
export interface SkippedFile {
  path: string;
  reason: string;
}

export interface ProjectIndex {
  files: ProjectFileEntry[];
  skipped: SkippedFile[];
}

/** code_docs table row as used by the UI. */
export interface CodeDocRecord {
  id: string;
  doc_type: string;
  title: string;
  content: string;
  created_at: string;
}
