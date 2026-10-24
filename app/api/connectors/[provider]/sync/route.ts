import { guardRoute } from "@/lib/auth";
import { connectorProviderSchema, sourceIdSchema } from "@/lib/validators/connectors";
import { syncProjectSource } from "@/lib/connectors/normalize";
import { createClient } from "@/lib/supabase/server";
import type { ProjectSourceRecord } from "@/types/connectors";

// Pull + index one connector source (same pipeline as file uploads).
// Body: { sourceId }. The source must belong to the caller (RLS) AND be of
// this provider.
export const maxDuration = 60;

type Ctx = { params: Promise<{ provider: string }> };

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const params = await ctx.params;
  const guard = await guardRoute({ rateKey: "sync", maxPerMinute: 6, blockGuests: true });
  if ("response" in guard) return guard.response;
  const provider = connectorProviderSchema.safeParse(params.provider);
  if (!provider.success) return Response.json({ error: "unknown_provider" }, { status: 404 });
  const parsed = sourceIdSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const supabase = await createClient();
  const { data: source } = await supabase
    .from("project_sources")
    .select("*")
    .eq("id", parsed.data.sourceId)
    .eq("source_type", provider.data)
    .maybeSingle();
  if (!source) return Response.json({ error: "source_not_found" }, { status: 404 });
  if ((source as ProjectSourceRecord).sync_status === "syncing") {
    return Response.json({ error: "sync_in_progress" }, { status: 409 });
  }

  const outcome = await syncProjectSource(supabase, guard.user.id, source as ProjectSourceRecord);
  return Response.json({ outcome });
}
