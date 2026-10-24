import { z } from "zod";

// In-app feedback (see components/shared/feedback-dialog.tsx).
export const FEEDBACK_CATEGORIES = ["bug", "idea", "praise", "other"] as const;
export const FEEDBACK_MAX_CHARS = 2000;

export const feedbackRequestSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  message: z.string().trim().min(3, "Please write a little more").max(FEEDBACK_MAX_CHARS),
  /** The page the user was on — a same-origin path only. */
  page: z
    .string()
    .max(200)
    .regex(/^\/[A-Za-z0-9\-._~/%?=&]*$/)
    .optional(),
});
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
