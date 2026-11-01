import { guardRoute } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DocumentRecord } from "@/types/documents";

// GET: the caller's ready library files that aren't in a project yet and
// aren't synced items — the "Attach existing documents" picker. RLS-scoped.
export async function GET(): Promise<Response> {
  const guard = await guardRoute({ rateKey: "documents-list", maxPerMinute: 60 });
  if ("response" in guard) return guard.response;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, file_name, file_type, storage_path, status, created_at")
    .is("project_id", null)
    .is("source_id", null)
    .eq("status", "ready")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: "list_failed" }, { status: 500 });
  return Response.json({ documents: (data ?? []) as DocumentRecord[] });
}
