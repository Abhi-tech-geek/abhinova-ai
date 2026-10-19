import { z } from "zod";

// All connector + knowledge-source zod schemas (never inline — CLAUDE.md).

export const connectorProviderSchema = z.enum(["jira", "github", "notion", "gdrive"]);

export const oauthCallbackSchema = z.object({
  code: z.string().min(1).max(2000),
  state: z.string().regex(/^[a-f0-9]{48}$/),
});

/** Config values are short strings (JQL, repo, filters) — never free blobs. */
const configSchema = z.record(z.string().regex(/^[a-zA-Z]+$/).max(30), z.string().max(500));

export const addSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("url"),
    url: z.string().trim().url().max(2000),
  }),
  z.object({
    type: connectorProviderSchema,
    title: z.string().trim().min(1).max(120),
    config: configSchema.default({}),
  }),
]);
export type AddSourceInput = z.infer<typeof addSourceSchema>;

export const sourceIdSchema = z.object({
  sourceId: z.string().uuid(),
});

export const connectReturnSchema = z.object({
  /** Same-origin path to come back to after OAuth (validated again). */
  returnTo: z.string().max(300).optional(),
});
