import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import type { User } from "@supabase/supabase-js";

// Thrown when no authenticated session exists. Every API route calls
// getAuthenticatedUser() first and converts this to a 401:
//
//   try {
//     const user = await getAuthenticatedUser();
//     ...
//   } catch (e) {
//     if (e instanceof UnauthorizedError) return unauthorizedResponse();
//     throw e;
//   }
export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function getAuthenticatedUser(): Promise<User> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export function unauthorizedResponse(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

// Anonymous (guest) sessions are authenticated but feature-restricted:
// no document uploads, no Wellness Mode, no settings (see CLAUDE.md).
export function isGuest(user: User): boolean {
  return user.is_anonymous ?? false;
}

/**
 * Route guard: authenticated user (401 otherwise), optional guest block
 * (403), and a per-user rate limit (429). Returns the user or a ready
 * Response — `if ("response" in guard) return guard.response;`.
 */
export async function guardRoute(options: {
  rateKey: string;
  maxPerMinute: number;
  blockGuests?: boolean;
}): Promise<{ user: User } | { response: Response }> {
  let user: User;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return { response: unauthorizedResponse() };
    throw e;
  }
  if (options.blockGuests && isGuest(user)) {
    return { response: Response.json({ error: "guest_not_allowed" }, { status: 403 }) };
  }
  const rl = await checkRateLimit(`${options.rateKey}:${user.id}`, options.maxPerMinute);
  if (!rl.allowed) {
    return {
      response: Response.json(
        { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      ),
    };
  }
  return { user };
}
