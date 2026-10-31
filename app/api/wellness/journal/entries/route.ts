import { guardRoute } from "@/lib/auth";
import { journalEntrySchema } from "@/lib/validators/wellness";
import { createClient } from "@/lib/supabase/server";

// POST: save a journal entry the user chose to keep (the AI analysis itself
// is /api/wellness/journal). RLS decides who may write journal entries.
export async function POST(request: Request): Promise<Response> {
  const guard = await guardRoute({ rateKey: "journal-save", maxPerMinute: 20 });
  if ("response" in guard) return guard.response;
  const parsed = journalEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from("journal_entries").insert({
    user_id: guard.user.id,
    content: parsed.data.content,
    distortions: parsed.data.distortions,
    reframe: parsed.data.reframe,
  });
  if (error) return Response.json({ error: "save_failed" }, { status: 500 });
  return Response.json({ ok: true }, { status: 201 });
}
