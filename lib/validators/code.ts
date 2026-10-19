import { z } from "zod";
import { modelIdSchema } from "@/lib/validators/models";

// All Code Studio zod schemas live here — never inline in routes (CLAUDE.md).

export const CODE_ACTIONS = [
  "explain",
  "fix",
  "refactor",
  "generate",
  "tests",
  "chat",
] as const;

/** A file sent as context. Content is size-capped; secret-scanned server-side. */
export const codeFileSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(120_000),
});
export type CodeFile = z.infer<typeof codeFileSchema>;

export const codeChatRequestSchema = z.object({
  action: z.enum(CODE_ACTIONS),
  message: z.string().min(1).max(20000),
  files: z.array(codeFileSchema).max(12).default([]),
  modelId: modelIdSchema.optional(),
});
export type CodeChatRequest = z.infer<typeof codeChatRequestSchema>;

export const codeEditRequestSchema = z.object({
  instruction: z.string().min(1).max(20000),
  files: z.array(codeFileSchema).min(1).max(12),
  modelId: modelIdSchema.optional(),
});
export type CodeEditRequest = z.infer<typeof codeEditRequestSchema>;

/** AI output for /api/code/edit — full new content per changed file. */
export const codeEditOutputSchema = z.object({
  changes: z
    .array(
      z.object({
        path: z.string().min(1).max(500),
        newContent: z.string(),
        note: z.string(),
      })
    )
    .min(1)
    .max(12),
  summary: z.string(),
});
export type CodeEditOutput = z.infer<typeof codeEditOutputSchema>;

export const DOC_TYPES = ["prd", "trd", "architecture", "api-spec"] as const;

export const codeDocsRequestSchema = z.object({
  docType: z.enum(DOC_TYPES),
  description: z.string().min(1).max(20000),
  files: z.array(codeFileSchema).max(12).default([]),
  modelId: modelIdSchema.optional(),
  /** Save the generated doc into a project (and its knowledge base). */
  projectId: z.string().uuid().optional(),
});
export type CodeDocsRequest = z.infer<typeof codeDocsRequestSchema>;
