import { guardRoute, isGuest } from "@/lib/auth";
import { feedbackRequestSchema } from "@/lib/validators/feedback";
import { redactSecrets } from "@/lib/code/secret-scan";
import { createAdminClient } from "@/lib/supabase/admin";

const FEEDBACK_PER_MINUTE = 3;

// POST → store one piece of feedback. Guests allowed. The DB caps it at 10 per
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

  // Clients have no privileges on `feedback`; only this route writes, through
  // the service-role-only submit_feedback() RPC (atomic 10/user/24h cap).
  // user_id / is_guest come from the verified session, never from the body.
  try {
    const { data, error } = await createAdminClient().rpc("submit_feedback", {
      p_user_id: user.id,
      p_is_guest: isGuest(user),
      p_category: category,
      p_message: text,
      p_page: page ?? null,
      p_user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    });
    if (error) throw error;
    if (data === "limit_reached") {
      return Response.json({ error: "feedback_limit_reached" }, { status: 429 });
    }
  } catch {
    return Response.json({ error: "feedback_failed" }, { status: 500 });
  }
  return Response.json({ ok: true }, { status: 201 });
}
