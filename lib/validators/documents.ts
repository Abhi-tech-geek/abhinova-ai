import { z } from "zod";

// All document zod schemas + upload rules live here — never inline (CLAUDE.md).
// Upload rules: allowlisted types only, max 10MB, sanitized filenames.

export const CODE_FILE_EXTENSIONS = ["js", "ts", "py", "java", "sql"] as const;

export const ALLOWED_FILE_EXTENSIONS = [
  "pdf",
  "docx",
  "doc",
  "pptx",
  "xlsx",
  "xls",
  "csv",
  "txt",
  "md",
  "json",
  ...CODE_FILE_EXTENSIONS,
] as const;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const OOXML_ZIP = ["application/zip", "application/x-zip-compressed"];
const GENERIC_BINARY = ["application/octet-stream"];

/** MIME allowlist checked server-side alongside the extension. */
export const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ...OOXML_ZIP],
  doc: ["application/msword", ...GENERIC_BINARY],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", ...OOXML_ZIP],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ...OOXML_ZIP],
  xls: ["application/vnd.ms-excel", ...GENERIC_BINARY],
  txt: ["text/plain"],
  csv: ["text/csv", "application/vnd.ms-excel", "text/plain"],
  md: ["text/markdown", "text/plain", "text/x-markdown"],
  json: ["application/json", "text/json", "text/plain"],
  js: ["text/javascript", "application/javascript", "application/x-javascript", "text/plain"],
  // Browsers label .ts as MPEG transport stream — the magic/null-byte check
  // below is what actually guarantees it is text.
  ts: ["video/mp2t", "application/typescript", "text/typescript", "text/plain", ...GENERIC_BINARY],
  py: ["text/x-python", "text/x-python-script", "application/x-python-code", "text/plain"],
  java: ["text/x-java", "text/x-java-source", "text/plain"],
  sql: ["application/sql", "application/x-sql", "text/x-sql", "text/plain", ...GENERIC_BINARY],
};

const startsWith = (buffer: Buffer, bytes: number[]) =>
  bytes.every((b, i) => buffer[i] === b);

/**
 * Magic-byte check: the file's actual bytes must match its claimed type
 * (extension + MIME alone are user-controlled). Text types get a null-byte
 * scan since plain text has no magic signature.
 */
export function matchesMagicBytes(ext: string, buffer: Buffer): boolean {
  if (ext === "pdf") {
    return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
  }
  if (ext === "docx" || ext === "pptx" || ext === "xlsx") {
    // OOXML files are ZIP containers: PK\x03\x04
    return startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]);
  }
  if (ext === "doc" || ext === "xls") {
    // Legacy Office = OLE compound file: D0 CF 11 E0 A1 B1 1A E1
    return startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  }
  // txt / csv / md / json / code: no signature — reject if it smells binary.
  const head = buffer.subarray(0, 8000);
  return !head.includes(0);
}

export function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

/** Strips any path parts and unsafe characters; keeps the extension. */
export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export const documentIdSchema = z.string().uuid();

export const processRequestSchema = z.object({
  documentId: z.string().uuid(),
});
export type ProcessRequest = z.infer<typeof processRequestSchema>;

/** Optional multipart field on upload: put the file straight into a project. */
export const uploadProjectIdSchema = z.string().uuid().nullable();

export const documentQuerySchema = z.object({
  question: z.string().min(1).max(4000),
  documentIds: z.array(z.string().uuid()).min(1).max(10),
  mode: z.enum(["ask", "summarize"]).default("ask"),
});
export type DocumentQuery = z.infer<typeof documentQuerySchema>;
