// In-app feedback (see components/shared/feedback-dialog.tsx). Kept free of
// zod so the dialog, which sits in every page's sidebar, doesn't ship it.
export const FEEDBACK_CATEGORIES = ["bug", "idea", "praise", "other"] as const;
export const FEEDBACK_MAX_CHARS = 2000;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];
