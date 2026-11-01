import { z } from "zod";

// Profile zod schemas (PATCH /api/profile). Matches the CHECK constraints on
// public.profiles in 001_init.sql.
export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().max(80).nullable(),
    avatarUrl: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || /^https?:\/\//i.test(v), "avatar must be an http(s) URL")
      .nullable(),
    themePref: z.enum(["dark", "light", "wellness"]),
    voiceLangPref: z.enum(["en-IN", "hi-IN"]),
    wellnessEnabled: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "nothing to update");
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
