import { guardRoute } from "@/lib/auth";
import { conversationIdSchema, renameConversationSchema } from "@/lib/validators/chat";
import { createClient } from "@/lib/supabase/server";

// Rename / delete one of the caller's chats (sidebar "⋯" menu). RLS limits
// both to the owner's rows; messages and share links cascade on delete.

type Ctx = { params: Promise<{ conversationId: string }> };

async function start(ctx: Ctx) {
  const guard = await guardRoute({ rateKey: "conversation-edit", maxPerMinute: 30 });
  if ("response" in guard) return guard;
  const id = conversationIdSchema.safeParse((await ctx.params).conversationId);
  if (!id.success) return { response: Response.json({ error: "invalid_conversation" }, { status: 400 }) };
  return { id: id.data, supabase: await createClient() };
}

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  const s = await start(ctx);
  if ("response" in s) return s.response;
  const parsed = renameConversationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { data, error } = await s.supabase
    .from("conversations")
    .update({ title: parsed.data.title })
    .eq("id", s.id)
    .select("id");
  if (error) return Response.json({ error: "rename_failed" }, { status: 500 });
  if (!data?.length) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: Ctx): Promise<Response> {
  const s = await start(ctx);
  if ("response" in s) return s.response;
  const { data, error } = await s.supabase.from("conversations").delete().eq("id", s.id).select("id");
  if (error) return Response.json({ error: "delete_failed" }, { status: 500 });
  if (!data?.length) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
