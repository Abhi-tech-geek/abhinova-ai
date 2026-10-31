import { createHash } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { BETA_LIMITS, isOpenBeta } from "@/lib/beta/config";
import { isLocalMode } from "@/lib/ai/ollama";

// SERVER-ONLY. Tamper-proof beta quotas, counted in public.beta_usage via the
// consume_beta_quota() RPC (service role; guests can't read or reset it).

export type QuotaKind =
  /** Every AI call: per-user, per-IP and site-wide daily counters. */
  | "ai"
  /** Starting a new workspace/project chat (lifetime). */
  | "chat"
  /** Starting a new wellness Talk session (lifetime). */
  | "wellness_session"
  /** A QA Studio run (daily). */
  | "qa"
  /** A document upload (lifetime). */
  | "doc";

interface QuotaItem {
  subject: string;
  bucket: string;
  limit: number;
  code: string;
}

/** UTC day — the same everywhere, so the daily reset is predictable. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Client IP, preferring headers the client can't forge. On Vercel,
 * x-vercel-forwarded-for / x-real-ip are set by the edge network; a
 * client-supplied x-forwarded-for is only a last resort (local dev / other
 * hosts) so spoofing it can't mint fresh per-IP quota on Vercel. A missing IP
 * falls into one shared "unknown" bucket — stricter, never looser.
 * Stored only as a salted hash — we never keep raw IPs.
 */
function ipSubject(request: Request): string {
  const first = (value: string | null) => value?.split(",")[0]?.trim() || null;
  const ip =
    first(request.headers.get("x-vercel-forwarded-for")) ??
    first(request.headers.get("x-real-ip")) ??
    first(request.headers.get("x-forwarded-for")) ??
    "unknown";
  const salt = process.env.ENCRYPTION_KEY ?? "abhinova-beta";
  return `ip:${createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32)}`;
}

function itemsFor(kinds: QuotaKind[], user: User, request: Request): QuotaItem[] {
  const userSubject = `user:${user.id}`;
  const day = today();
  const items: QuotaItem[] = [];
  for (const kind of kinds) {
    switch (kind) {
      case "ai":
        items.push(
          { subject: userSubject, bucket: `ai:${day}`, limit: BETA_LIMITS.aiCallsPerUserPerDay, code: "daily_limit_reached" },
          { subject: ipSubject(request), bucket: `ai:${day}`, limit: BETA_LIMITS.aiCallsPerIpPerDay, code: "ip_limit_reached" },
          { subject: "site", bucket: `ai:${day}`, limit: BETA_LIMITS.aiCallsSitePerDay, code: "site_limit_reached" }
        );
        break;
      case "chat":
        items.push({ subject: userSubject, bucket: "chat", limit: BETA_LIMITS.chats, code: "chat_limit_reached" });
        break;
      case "wellness_session":
        items.push({ subject: userSubject, bucket: "wellness_session", limit: BETA_LIMITS.wellnessSessions, code: "wellness_session_limit_reached" });
        break;
      case "qa":
        items.push({ subject: userSubject, bucket: `qa:${day}`, limit: BETA_LIMITS.qaRunsPerDay, code: "qa_limit_reached" });
        break;
      case "doc":
        items.push({ subject: userSubject, bucket: "doc", limit: BETA_LIMITS.documents, code: "doc_limit_reached" });
        break;
    }
  }
  return items;
}

/**
 * Consume beta quota for one request. Returns null when allowed (counters were
 * incremented) or a ready-to-return 429 Response. No-op when the beta is off.
 * Fails CLOSED: if the counter can't be checked, the AI call doesn't run.
 */
export async function enforceBetaQuota(
  user: User,
  request: Request,
  kinds: QuotaKind[]
): Promise<Response | null> {
  // Local Mode runs on the developer's own machine and model: there's no shared
  // free cloud quota to protect.
  if (!isOpenBeta() || isLocalMode() || kinds.length === 0) return null;
  try {
    const { data, error } = await createAdminClient().rpc("consume_beta_quota", {
      p_items: itemsFor(kinds, user, request),
    });
    if (error) throw error;
    if (data === "ok") return null;
    return Response.json({ error: data as string }, { status: 429 });
  } catch {
    return Response.json({ error: "quota_unavailable" }, { status: 503 });
  }
}

export interface BetaUsage {
  aiUsedToday: number;
  chatsStarted: number;
  qaRunsToday: number;
  docsUploaded: number;
  wellnessSessions: number;
}

/** Current guest usage for the banner. Zeroes on any error. */
export async function getBetaUsage(user: User): Promise<BetaUsage> {
  const usage: BetaUsage = { aiUsedToday: 0, chatsStarted: 0, qaRunsToday: 0, docsUploaded: 0, wellnessSessions: 0 };
  try {
    const day = today();
    const { data } = await createAdminClient()
      .from("beta_usage")
      .select("bucket, used")
      .eq("subject", `user:${user.id}`)
      .in("bucket", [`ai:${day}`, "chat", `qa:${day}`, "doc", "wellness_session"]);
    for (const row of data ?? []) {
      const used = row.used as number;
      if (row.bucket === `ai:${day}`) usage.aiUsedToday = used;
      else if (row.bucket === "chat") usage.chatsStarted = used;
      else if (row.bucket === `qa:${day}`) usage.qaRunsToday = used;
      else if (row.bucket === "doc") usage.docsUploaded = used;
      else if (row.bucket === "wellness_session") usage.wellnessSessions = used;
    }
  } catch {
    // banner just shows full quota
  }
  return usage;
}
