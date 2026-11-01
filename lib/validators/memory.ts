import { z } from "zod";

// Memory + saved prompts (migration 007). Limits match the table CHECKs.
export const memoryAddSchema = z.object({
  content: z.string().trim().min(1).max(300),
  /** "/remember" turns memory on in the same step. */
  enable: z.boolean().optional(),
});
export const memoryToggleSchema = z.object({ enabled: z.boolean() });

export const savedPromptSchema = z.object({
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(4000),
});

export const rowIdSchema = z.string().uuid();
