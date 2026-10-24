import { guardRoute, isGuest } from "@/lib/auth";
import { feedbackRequestSchema } from "@/lib/validators/feedback";
import { redactSecrets } from "@/lib/code/secret-scan";
import { createClient } from "@/lib/supabase/server";

const FEEDBACK_PER_MINUTE = 3;

// POST → store one piece of feedback. Guests allowed. RLS caps it at 10 per
// user per 24h; this route adds a per-minute limit and redacts any secret a
// user pastes by accident (keys never land in the table).
export async function POST(request: Request): Promise<Response> {
  const guard = await guardRoute({ rateKey: "feedback", maxPerMinute: FEEDBACK_PER_MINUTE });
  if ("response" in guard) return guard.response;
  const { user } = guard;

  const body = await request.json().catch(() => null);
  const parsed = feedbackRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const { category, message, page } = parsed.data;
  const { text } = redactSecrets(message);
  const supabase = createClient();
  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    is_guest: isGuest(user),
    category,
    message: text,
    page: page ?? null,
    user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  });

  if (error) {
    // 42501 = RLS rejected the row → the daily cap was hit.
    const limited = error.code === "42501";
    return Response.json(
      { error: limited ? "feedback_limit_reached" : "feedback_failed" },
      { status: limited ? 429 : 500 }
    );
  }
  return Response.json({ ok: true }, { status: 201 });
}
