import {
  getAuthenticatedUser,
  UnauthorizedError,
  unauthorizedResponse,
  isGuest,
} from "@/lib/auth";
import { moodCheckInSchema } from "@/lib/validators/wellness";
import { checkRateLimit, AI_REQUESTS_PER_MINUTE } from "@/lib/rate-limit";
import { completeChat } from "@/lib/ai/router";
import { MOOD_INSIGHTS_PROMPT } from "@/lib/ai/prompts/wellness";
import { createClient } from "@/lib/supabase/server";
import { isOpenBeta } from "@/lib/beta/config";
import { enforceBetaQuota } from "@/lib/beta/quota";

// POST = save a daily check-in. GET = weekly AI insight (cached per week in
// wellness_insights so the AI runs at most once per user per week).

export async function POST(request: Request): Promise<Response> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
  if (isGuest(user) && !isOpenBeta()) {
    return Response.json({ error: "guest_not_allowed" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = moodCheckInSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("mood_logs").insert({
    user_id: user.id,
    mood: parsed.data.mood,
    note: parsed.data.note ?? null,
    sleep_hours: parsed.data.sleepHours ?? null,
  });
  if (error) {
    return Response.json({ error: "save_failed" }, { status: 500 });
  }
  return Response.json({ saved: true });
}

function mondayOfCurrentWeek(): string {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  return monday.toISOString().slice(0, 10);
}

export async function GET(request: Request): Promise<Response> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
  if (isGuest(user) && !isOpenBeta()) {
    return Response.json({ error: "guest_not_allowed" }, { status: 403 });
  }

  const supabase = await createClient();
  const periodStart = mondayOfCurrentWeek();

  // Cached this week already?
  const { data: cached } = await supabase
    .from("wellness_insights")
    .select("content")
    .eq("kind", "weekly_mood")
    .eq("period_start", periodStart)
    .maybeSingle();
  if (cached) {
    return Response.json({ insight: cached.content, cached: true });
  }

  const { data: logs } = await supabase
    .from("mood_logs")
    .select("mood, note, sleep_hours, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (!logs || logs.length < 3) {
    return Response.json({ insight: null, reason: "not_enough_data" });
  }

  const rl = await checkRateLimit(`wellness:${user.id}`, AI_REQUESTS_PER_MINUTE);
  if (!rl.allowed) {
    return Response.json(
      { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429 }
    );
  }
  const quotaBlocked = await enforceBetaQuota(user, request, ["ai"]);
  if (quotaBlocked) return quotaBlocked;

  const lines = logs
    .reverse()
    .map(
      (l) =>
        `${new Date(l.created_at).toDateString()}: mood ${l.mood}/5` +
        (l.sleep_hours !== null ? `, sleep ${l.sleep_hours}h` : "") +
        (l.note ? `, note: ${l.note}` : "")
    )
    .join("\n");

  try {
    const { text } = await completeChat([
      { role: "system", content: MOOD_INSIGHTS_PROMPT },
      { role: "user", content: lines },
    ]);
    await supabase.from("wellness_insights").upsert(
      {
        user_id: user.id,
        kind: "weekly_mood",
        period_start: periodStart,
        content: text,
      },
      { onConflict: "user_id,kind,period_start" }
    );
    return Response.json({ insight: text, cached: false });
  } catch {
    return Response.json({ error: "ai_unavailable" }, { status: 502 });
  }
}
