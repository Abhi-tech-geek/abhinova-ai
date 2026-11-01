import { z } from "zod";
import { modelIdSchema } from "@/lib/validators/models";

// All chat zod schemas live here — never inline in routes (see CLAUDE.md).
export const chatRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  /** Only used when starting a NEW conversation inside a project. */
  projectId: z.string().uuid().optional(),
  message: z.string().min(1).max(8000),
  modelId: modelIdSchema.optional(),
  /** Agent Mode: let the model use tools (lib/ai/agent.ts) before answering. */
  agent: z.boolean().optional(),
  /** Re-answer the conversation's last user message (no new user message is stored). */
  regenerate: z.boolean().optional(),
}).refine((v) => !v.regenerate || !!v.conversationId, { message: "regenerate needs a conversationId" });
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const conversationIdSchema = z.string().uuid();

/** PATCH /api/conversations/[id] — rename from the sidebar. */
export const renameConversationSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export const messageIdSchema = z.string().uuid();

/** GET /api/conversations/search?q= — chat titles + message text. */
export const chatSearchSchema = z.string().trim().min(2).max(100);

/** POST /api/messages/[id]/feedback — 1 = 👍, -1 = 👎, 0 = clear (migration 007). */
export const messageFeedbackSchema = z.object({
  rating: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
});

/** Public share link id (/share/<id>, migration 006). */
export const shareIdSchema = z.string().uuid();
