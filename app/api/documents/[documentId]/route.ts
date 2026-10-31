import { guardRoute } from "@/lib/auth";
import { documentIdSchema } from "@/lib/validators/documents";
import { createClient } from "@/lib/supabase/server";

// DELETE one of the caller's documents: the stored file first, then the row
// (its chunks cascade). Synced/link items have no stored file. RLS-scoped.
type Ctx = { params: Promise<{ documentId: string }> };

export async function DELETE(_request: Request, ctx: Ctx): Promise<Response> {
  const guard = await guardRoute({ rateKey: "document-delete", maxPerMinute: 30 });
  if ("response" in guard) return guard.response;
  const id = documentIdSchema.safeParse((await ctx.params).documentId);
  if (!id.success) return Response.json({ error: "invalid_document" }, { status: 400 });

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, storage_path")
    .eq("id", id.data)
    .maybeSingle();
  if (!doc) return Response.json({ error: "not_found" }, { status: 404 });

  if (doc.storage_path) await supabase.storage.from("documents").remove([doc.storage_path]);
  const { error } = await supabase.from("documents").delete().eq("id", doc.id);
  if (error) return Response.json({ error: "delete_failed" }, { status: 500 });
  return Response.json({ ok: true });
}
