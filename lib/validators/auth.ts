import { z } from "zod";

// Auth form schemas — never inline in components (see CLAUDE.md).
export const emailPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type EmailPasswordInput = z.infer<typeof emailPasswordSchema>;
