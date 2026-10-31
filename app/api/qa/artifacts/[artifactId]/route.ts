import { guardRoute } from "@/lib/auth";
import { qaArtifactIdSchema } from "@/lib/validators/qa";
import { createClient } from "@/lib/supabase/server";

// DELETE one saved QA Studio run from the sidebar history. RLS-scoped.
type Ctx = { params: Promise<{ artifactId: string }> };

export async function DELETE(_request: Request, ctx: Ctx): Promise<Response> {
  const guard = await guardRoute({ rateKey: "history-delete", maxPerMinute: 30 });
  if ("response" in guard) return guard.response;
  const id = qaArtifactIdSchema.safeParse((await ctx.params).artifactId);
  if (!id.success) return Response.json({ error: "invalid_id" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("qa_artifacts").delete().eq("id", id.data).select("id");
  if (error) return Response.json({ error: "delete_failed" }, { status: 500 });
  if (!data?.length) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
