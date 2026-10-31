import { guardRoute } from "@/lib/auth";
import { documentIdSchema } from "@/lib/validators/documents";
import { joinChunks } from "@/lib/qa-tools";
import { createClient } from "@/lib/supabase/server";

// GET the readable text of one of the caller's indexed documents (QA Studio's
// "Load from a document"). Rebuilt from its stored passages — secrets were
// already redacted at upload. RLS → only the owner's chunks.
const MAX_CHARS = 20000;
type Ctx = { params: Promise<{ documentId: string }> };

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const guard = await guardRoute({ rateKey: "document-text", maxPerMinute: 20 });
  if ("response" in guard) return guard.response;
  const id = documentIdSchema.safeParse((await ctx.params).documentId);
  if (!id.success) return Response.json({ error: "invalid_document" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_chunks")
    .select("content")
    .eq("document_id", id.data)
    .order("chunk_index", { ascending: true })
    .limit(60);
  if (error) return Response.json({ error: "read_failed" }, { status: 500 });
  if (!data?.length) return Response.json({ error: "not_found" }, { status: 404 });
  const text = joinChunks(data.map((r) => r.content as string));
  return Response.json({ text: text.slice(0, MAX_CHARS), truncated: text.length > MAX_CHARS });
}
