import { getAuthenticatedUser, UnauthorizedError, unauthorizedResponse } from "@/lib/auth";
import { messageFeedbackSchema, messageIdSchema } from "@/lib/validators/chat";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

// 👍 / 👎 on one of the caller's assistant replies (migration 007). RLS only
// lets a rating land on a reply the caller owns. rating 0 clears it.
type Ctx = { params: Promise<{ messageId: string }> };

/** Table missing → the owner hasn't run migration 007 yet. */
const notSetUp = (code: string | undefined) => code === "42P01" || code === "PGRST205";

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
  const id = messageIdSchema.safeParse((await ctx.params).messageId);
  const body = messageFeedbackSchema.safeParse(await request.json().catch(() => null));
  if (!id.success || !body.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const rl = await checkRateLimit(`feedback-msg:${user.id}`, 30);
  if (!rl.allowed) return Response.json({ error: "rate_limited", retryAfterMs: rl.retryAfterMs }, { status: 429 });

  const supabase = await createClient();
  const { error } =
    body.data.rating === 0
      ? await supabase.from("message_feedback").delete().eq("message_id", id.data)
      : await supabase
          .from("message_feedback")
          .upsert({ message_id: id.data, user_id: user.id, rating: body.data.rating }, { onConflict: "message_id" });
  if (error) {
    if (notSetUp(error.code)) return Response.json({ error: "feedback_not_set_up" }, { status: 503 });
    // RLS refused: not the caller's reply (or not a reply at all).
    return Response.json({ error: "cannot_rate" }, { status: 403 });
  }
  return Response.json({ rating: body.data.rating });
}
