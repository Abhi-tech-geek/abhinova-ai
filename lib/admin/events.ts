import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLocalMode } from "@/lib/ai/ollama";

// Site-wide event counters for the owner dashboard: just a number per event
// per UTC day — no user, no content. Stored as beta_usage rows
// (subject "site", bucket "event:<name>:<day>") through the atomic
// consume_beta_quota() increment, with a limit nothing ever reaches.
// SERVER-ONLY. Never throws: a stats hiccup must not break a request.

export const TRACKED_EVENTS = ["ai_busy", "agent_fallback", "regenerate", "source_check", "chat_search"] as const;
export type TrackedEvent = (typeof TRACKED_EVENTS)[number];

const NO_LIMIT = 2_147_483_647;

/** Counts an event after the response is sent (adds no latency). */
export function countEvent(name: TrackedEvent): void {
  try {
    after(() => trackEvent(name));
  } catch {
    void trackEvent(name); // outside a request scope
  }
}

async function trackEvent(name: TrackedEvent): Promise<void> {
  // Local runs usually point at the live database — only the deployed site
  // counts (TRACK_EVENTS=1 turns it on elsewhere, e.g. to test this).
  const enabled = process.env.VERCEL_ENV === "production" || process.env.TRACK_EVENTS === "1";
  if (!enabled || isLocalMode() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const day = new Date().toISOString().slice(0, 10);
  try {
    await createAdminClient().rpc("consume_beta_quota", {
      p_items: [{ subject: "site", bucket: `event:${name}:${day}`, limit: NO_LIMIT }],
    });
  } catch {
    // ignore — counters are best effort
  }
}
