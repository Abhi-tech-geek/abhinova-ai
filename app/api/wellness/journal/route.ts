import {
  getAuthenticatedUser,
  UnauthorizedError,
  unauthorizedResponse,
  isGuest,
} from "@/lib/auth";
import {
  journalAnalyzeSchema,
  journalAnalysisOutputSchema,
} from "@/lib/validators/wellness";
import { checkRateLimit, AI_REQUESTS_PER_MINUTE } from "@/lib/rate-limit";
import { completeChat, extractJsonObject, aiFailureResponse } from "@/lib/ai/router";
import { JOURNAL_ANALYSIS_PROMPT, THEMES_PROMPT } from "@/lib/ai/prompts/wellness";
import { COGNITIVE_DISTORTIONS } from "@/lib/wellness/distortions";
import { createClient } from "@/lib/supabase/server";
import type { AiMessage } from "@/types/chat";
import { isOpenBeta } from "@/lib/beta/config";
import { enforceBetaQuota } from "@/lib/beta/quota";

// POST = analyze a journal entry (distortions from the fixed list + one kind
// reframe; saving is a separate client-side insert the user chooses to make).
// GET = monthly recurring themes (cached per month in wellness_insights).

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
  const parsed = journalAnalyzeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
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

  const messages: AiMessage[] = [
    {
      role: "system",
      content: `${JOURNAL_ANALYSIS_PROMPT}\n\nThe fixed distortion list (use these exact names): ${COGNITIVE_DISTORTIONS.join(", ")}`,
    },
    {
      role: "user",
      content: `<journal_entry>\n${parsed.data.content}\n</journal_entry>`,
    },
  ];

  try {
    const first = await completeChat(messages, request.signal);
    let output = tryParse(first.text);
    if (output === null) {
      const retry = await completeChat([
        ...messages,
        { role: "assistant", content: first.text },
        {
          role: "user",
          content:
            "Your previous response was not valid JSON matching the schema. Respond with ONLY the corrected JSON object.",
        },
      ]);
      output = tryParse(retry.text);
    }
    if (output === null) {
      return Response.json({ error: "generation_parse_failed" }, { status: 422 });
    }
    return Response.json({ analysis: output });
  } catch (err) {
    return aiFailureResponse(err);
  }
}

function tryParse(text: string) {
  try {
    const candidate = JSON.parse(extractJsonObject(text));
    const result = journalAnalysisOutputSchema.safeParse(candidate);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
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
  const periodStart = `${new Date().toISOString().slice(0, 7)}-01`; // month start

  const { data: cached } = await supabase
    .from("wellness_insights")
    .select("content")
    .eq("kind", "monthly_themes")
    .eq("period_start", periodStart)
    .maybeSingle();
  if (cached) {
    return Response.json({ themes: cached.content, cached: true });
  }

  const { data: entries } = await supabase
    .from("journal_entries")
    .select("content, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  const { data: summaries } = await supabase
    .from("conversations")
    .select("summary")
    .eq("mode", "wellness")
    .not("summary", "is", null)
    .order("updated_at", { ascending: false })
    .limit(10);

  const material = [
    ...(entries ?? []).map((e) => `Journal: ${e.content}`),
    ...(summaries ?? []).map((s) => `Session summary: ${s.summary}`),
  ]
    .join("\n\n")
    .slice(0, 20000);

  if (material.length < 100) {
    return Response.json({ themes: null, reason: "not_enough_data" });
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

  try {
    const { text } = await completeChat([
      { role: "system", content: THEMES_PROMPT },
      { role: "user", content: material },
    ]);
    await supabase.from("wellness_insights").upsert(
      {
        user_id: user.id,
        kind: "monthly_themes",
        period_start: periodStart,
        content: text,
      },
      { onConflict: "user_id,kind,period_start" }
    );
    return Response.json({ themes: text, cached: false });
  } catch (err) {
    return aiFailureResponse(err);
  }
}
