import { guardRoute } from "@/lib/auth";
import { codeDocIdSchema } from "@/lib/validators/code";
import { createClient } from "@/lib/supabase/server";

// DELETE one saved Code Studio doc from the sidebar history. RLS-scoped.
type Ctx = { params: Promise<{ docId: string }> };

export async function DELETE(_request: Request, ctx: Ctx): Promise<Response> {
  const guard = await guardRoute({ rateKey: "history-delete", maxPerMinute: 30 });
  if ("response" in guard) return guard.response;
  const id = codeDocIdSchema.safeParse((await ctx.params).docId);
  if (!id.success) return Response.json({ error: "invalid_id" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("code_docs").delete().eq("id", id.data).select("id");
  if (error) return Response.json({ error: "delete_failed" }, { status: 500 });
  if (!data?.length) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
