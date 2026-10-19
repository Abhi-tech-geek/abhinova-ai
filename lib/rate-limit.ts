// In-memory sliding-window rate limiter for AI endpoints, keyed by user id.
// LRU-capped so the map can't grow unbounded. The interface is async so a
// distributed store (Upstash Redis) can replace the internals later without
// touching any route.

const WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 5_000;

export const AI_REQUESTS_PER_MINUTE = 20;
export const GUEST_AI_REQUESTS_PER_MINUTE = 10;
export const GUEST_MAX_MESSAGES_PER_CONVERSATION = 15;

const requestLog = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export async function checkRateLimit(
  key: string,
  maxPerMinute: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const recent = (requestLog.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= maxPerMinute) {
    requestLog.set(key, recent);
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - recent[0]) };
  }

  recent.push(now);
  // Delete + set moves the key to the end of the Map = LRU order.
  requestLog.delete(key);
  requestLog.set(key, recent);
  if (requestLog.size > MAX_TRACKED_KEYS) {
    const oldest = requestLog.keys().next().value;
    if (oldest !== undefined) requestLog.delete(oldest);
  }
  return { allowed: true, retryAfterMs: 0 };
}
