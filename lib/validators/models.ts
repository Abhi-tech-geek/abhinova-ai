import { z } from "zod";

// All model/BYOK zod schemas live here — never inline in routes (CLAUDE.md).

export const providerEnum = z.enum([
  "openai",
  "anthropic",
  "groq",
  "gemini",
  "openrouter",
]);

export const addApiKeySchema = z.object({
  provider: providerEnum,
  apiKey: z.string().min(10).max(500),
  label: z.string().max(60).optional(),
});
export type AddApiKeyRequest = z.infer<typeof addApiKeySchema>;

export const deleteApiKeySchema = z.object({
  keyId: z.string().uuid(),
});

/** "groq/model", "gemini/model" or "byok/<keyId>/<model>" — parsed server-side. */
export const modelIdSchema = z.string().min(3).max(200);
