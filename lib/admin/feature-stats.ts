import type { SupabaseClient } from "@supabase/supabase-js";
import { TRACKED_EVENTS } from "@/lib/admin/events";
import type { FeatureStats } from "@/types/admin";

// Owner dashboard numbers for the newer features (service-role client).
// Aggregates ONLY: every query is a head-count or a site counter — never a
// message, fact, prompt or file. A table that doesn't exist yet counts as 0.

async function count(
  q: PromiseLike<{ count: number | null; error: unknown }>
): Promise<number> {
  const { count: n, error } = await q;
  return error ? 0 : (n ?? 0);
}

export async function getFeatureStats(admin: SupabaseClient, days: number): Promise<FeatureStats> {
  const since = new Date(Date.now() - (days - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();
  const head = { count: "exact" as const, head: true };

  const [up, down, upAll, downAll, agentReplies, coverageRuns, screenshotBugReports, memoryOn, memoryFacts, savedPrompts, sharedChats, counters] =
    await Promise.all([
      count(admin.from("message_feedback").select("id", head).eq("rating", 1).gte("created_at", sinceIso)),
      count(admin.from("message_feedback").select("id", head).eq("rating", -1).gte("created_at", sinceIso)),
      count(admin.from("message_feedback").select("id", head).eq("rating", 1)),
      count(admin.from("message_feedback").select("id", head).eq("rating", -1)),
      count(admin.from("messages").select("id", head).eq("role", "assistant").not("metadata->steps", "is", null).gte("created_at", sinceIso)),
      count(admin.from("qa_artifacts").select("id", head).eq("type", "requirement-coverage").gte("created_at", sinceIso)),
      count(admin.from("qa_artifacts").select("id", head).eq("type", "bug-report").like("input", "%[screenshot attached]").gte("created_at", sinceIso)),
      count(admin.from("profiles").select("id", head).eq("memory_enabled", true)),
      count(admin.from("user_memories").select("id", head)),
      count(admin.from("saved_prompts").select("id", head)),
      count(admin.from("shared_chats").select("id", head)),
      admin.from("beta_usage").select("bucket, used").eq("subject", "site").like("bucket", "event:%"),
    ]);

  const sinceDay = sinceIso.slice(0, 10);
  const events = Object.fromEntries(TRACKED_EVENTS.map((e) => [e, 0])) as FeatureStats["events"];
  const busy = new Map<string, number>();
  for (const row of (counters.data ?? []) as { bucket: string; used: number }[]) {
    const [, name, day] = row.bucket.split(":");
    if (!day || day < sinceDay || !(name in events)) continue;
    events[name as keyof FeatureStats["events"]] += row.used;
    if (name === "ai_busy") busy.set(day, row.used);
  }
  const busyByDay = Array.from({ length: days }, (_, i) => {
    const day = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    return { day, count: busy.get(day) ?? 0 };
  });

  return {
    ratings: { up, down, upAllTime: upAll, downAllTime: downAll },
    events,
    busyByDay,
    usage: { agentReplies, coverageRuns, screenshotBugReports },
    personalisation: { memoryOn, memoryFacts, savedPrompts, sharedChats },
  };
}
