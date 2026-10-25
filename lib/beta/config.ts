// Open beta: no login/signup pages — every visitor becomes an anonymous guest
// automatically, and generous-but-firm limits protect the free AI quota.
// Client-safe (no secrets). Set NEXT_PUBLIC_OPEN_BETA=false (and rebuild) to
// bring login/signup back. ON by default.

/**
 * Same answer on server, edge middleware and browser: NEXT_PUBLIC_* is inlined
 * at build time everywhere, so UI and API can never disagree.
 */
export function isOpenBeta(): boolean {
  return process.env.NEXT_PUBLIC_OPEN_BETA !== "false";
}

export const BETA_LIMITS = {
  /** Workspace chats (incl. project chats) a guest can ever start. */
  chats: 2,
  /** Wellness "Talk" sessions a guest can ever start. */
  wellnessSessions: 2,
  /** User messages per chat. */
  messagesPerChat: 10,
  /** QA Studio runs per day. */
  qaRunsPerDay: 5,
  /** Projects a guest can have at once (also enforced by RLS). */
  projects: 1,
  /** Documents a guest can ever upload (RLS also caps live rows at 2). */
  documents: 2,
  /** AI replies (any feature) per guest per day. */
  aiCallsPerUserPerDay: 25,
  /** Per network/IP per day — stops "clear cookies, get a new quota". */
  aiCallsPerIpPerDay: 75,
  /** Whole site per day — protects the free Groq/Gemini tiers. */
  aiCallsSitePerDay: 1000,
} as const;

/** Window event: "usage may have changed" → the beta banner refetches. */
export const BETA_USAGE_EVENT = "anv:beta-usage-changed";

/** Error codes the quota layer returns → friendly copy for the UI. */
export const BETA_ERROR_MESSAGES: Record<string, string> = {
  daily_limit_reached: `You've used today's ${BETA_LIMITS.aiCallsPerUserPerDay} free AI replies. Come back tomorrow! 🌙`,
  ip_limit_reached: "Your network has used today's free AI replies. Try again tomorrow.",
  site_limit_reached: "AbhiNova is very popular today and hit its daily limit. Please try again tomorrow 🙏",
  chat_limit_reached: `Beta limit: you can start ${BETA_LIMITS.chats} chats. Keep going in an existing chat.`,
  wellness_session_limit_reached: `Beta limit: ${BETA_LIMITS.wellnessSessions} wellness sessions.`,
  guest_conversation_limit: `This chat reached ${BETA_LIMITS.messagesPerChat} messages (beta limit).`,
  qa_limit_reached: `Beta limit: ${BETA_LIMITS.qaRunsPerDay} QA Studio runs per day. Try again tomorrow.`,
  doc_limit_reached: `Beta limit: ${BETA_LIMITS.documents} document uploads.`,
  guest_limit_reached: "You've reached the beta limit for this.",
  quota_unavailable: "Usage limits couldn't be checked right now — please try again in a moment.",
};

/**
 * "ai_busy": every AI provider (Groq → Gemini → Flash-Lite) is out of free
 * quota or overloaded. Not the user's fault and usually gone in minutes.
 */
export const AI_BUSY_TITLE = "AbhiNova is taking a short break ☕";
export const AI_BUSY_MESSAGE =
  "Our free AI quota is used up for the moment. It usually comes back within a few minutes — your message is still in the box, just send it again.";

/** UI helper: friendly text for a beta/limit error code, or null. */
export function betaErrorMessage(code: unknown): string | null {
  return typeof code === "string" ? (BETA_ERROR_MESSAGES[code] ?? null) : null;
}
