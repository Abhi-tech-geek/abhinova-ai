import {
  getAuthenticatedUser,
  UnauthorizedError,
  unauthorizedResponse,
} from "@/lib/auth";
import { conversationIdSchema } from "@/lib/validators/chat";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

// Share a workspace chat by link (migration 006). GET = current status,
// POST = create (idempotent), DELETE = stop sharing. RLS + the insert policy
// guarantee the caller owns the chat and that it's not a Wellness chat.

type Ctx = { params: Promise<{ conversationId: string }> };

/** Table missing → the owner hasn't run migration 006 yet. */
function notSetUp(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205";
}

async function start(ctx: Ctx) {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return { response: unauthorizedResponse() };
    throw e;
  }
  const params = await ctx.params;
  const id = conversationIdSchema.safeParse(params.conversationId);
  if (!id.success) return { response: Response.json({ error: "invalid_conversation" }, { status: 400 }) };
  return { user, conversationId: id.data, supabase: await createClient() };
}

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const s = await start(ctx);
  if ("response" in s) return s.response!;
  const { data, error } = await s.supabase
    .from("shared_chats")
    .select("id")
    .eq("conversation_id", s.conversationId)
    .maybeSingle();
  if (error) {
    return notSetUp(error.code)
      ? Response.json({ error: "sharing_not_set_up" }, { status: 503 })
      : Response.json({ error: "share_lookup_failed" }, { status: 500 });
  }
  return Response.json({ shared: !!data, shareId: data?.id ?? null });
}

export async function POST(_request: Request, ctx: Ctx): Promise<Response> {
  const s = await start(ctx);
  if ("response" in s) return s.response!;
  const rl = await checkRateLimit(`share:${s.user.id}`, 10);
  if (!rl.allowed) return Response.json({ error: "rate_limited", retryAfterMs: rl.retryAfterMs }, { status: 429 });

  const existing = await s.supabase
    .from("shared_chats")
    .select("id")
    .eq("conversation_id", s.conversationId)
    .maybeSingle();
  if (existing.error) {
    return notSetUp(existing.error.code)
      ? Response.json({ error: "sharing_not_set_up" }, { status: 503 })
      : Response.json({ error: "share_failed" }, { status: 500 });
  }
  if (existing.data) return Response.json({ shareId: existing.data.id });

  const { data, error } = await s.supabase
    .from("shared_chats")
    .insert({ conversation_id: s.conversationId, user_id: s.user.id })
    .select("id")
    .single();
  if (error || !data) {
    // RLS insert check failed: not the caller's chat, or not a workspace chat.
    return Response.json({ error: "cannot_share" }, { status: 403 });
  }
  return Response.json({ shareId: data.id }, { status: 201 });
}

export async function DELETE(_request: Request, ctx: Ctx): Promise<Response> {
  const s = await start(ctx);
  if ("response" in s) return s.response!;
  const { error } = await s.supabase.from("shared_chats").delete().eq("conversation_id", s.conversationId);
  if (error) {
    return notSetUp(error.code)
      ? Response.json({ error: "sharing_not_set_up" }, { status: 503 })
      : Response.json({ error: "unshare_failed" }, { status: 500 });
  }
  return Response.json({ shared: false });
}
