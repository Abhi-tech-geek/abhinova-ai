import { z } from "zod";
import { modelIdSchema } from "@/lib/validators/models";

// All chat zod schemas live here — never inline in routes (see CLAUDE.md).
export const chatRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  /** Only used when starting a NEW conversation inside a project. */
  projectId: z.string().uuid().optional(),
  message: z.string().min(1).max(8000),
  modelId: modelIdSchema.optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const conversationIdSchema = z.string().uuid();

/** Public share link id (/share/<id>, migration 006). */
export const shareIdSchema = z.string().uuid();
