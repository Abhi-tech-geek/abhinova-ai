import { guardRoute } from "@/lib/auth";
import { projectIdSchema } from "@/lib/validators/projects";
import { addSourceSchema, sourceIdSchema } from "@/lib/validators/connectors";
import { getOwnedProject, MAX_SOURCES_PER_PROJECT } from "@/lib/projects/scope";
import { isConnectorConfigured } from "@/lib/connectors/oauth";
import { assertSafeUrlShape, UnsafeUrlError } from "@/lib/connectors/web";
import { REPO_PATTERN } from "@/lib/connectors/github";
import { syncProjectSource } from "@/lib/connectors/normalize";
import { createClient } from "@/lib/supabase/server";
import type { ProjectSourceRecord } from "@/types/connectors";

// Knowledge sources attached to a project (links + connector feeds).
//   GET    → list    POST → add (+ first sync)
//   PUT    → "Sync now" for one source    DELETE → remove source + its chunks
// Guests can't use links or connectors (403); files only.
export const maxDuration = 60;

type Ctx = { params: Promise<{ projectId: string }> };

async function ownedProject(projectId: string) {
  const id = projectIdSchema.safeParse(projectId);
  if (!id.success) return null;
  const supabase = await createClient();
  const project = await getOwnedProject(supabase, id.data);
  return project ? { supabase, project } : null;
}

export async function GET(_request: Request, ctx: Ctx): Promise<Response> {
  const params = await ctx.params;
  const guard = await guardRoute({ rateKey: "projects", maxPerMinute: 60 });
  if ("response" in guard) return guard.response;
  const owned = await ownedProject(params.projectId);
  if (!owned) return Response.json({ error: "project_not_found" }, { status: 404 });
  const { data } = await owned.supabase
    .from("project_sources")
    .select("*")
    .eq("project_id", owned.project.id)
    .order("created_at");
  return Response.json({ sources: data ?? [] });
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  const params = await ctx.params;
  const guard = await guardRoute({ rateKey: "sync", maxPerMinute: 6, blockGuests: true });
  if ("response" in guard) return guard.response;
  const owned = await ownedProject(params.projectId);
  if (!owned) return Response.json({ error: "project_not_found" }, { status: 404 });

  const parsed = addSourceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const { count } = await owned.supabase
    .from("project_sources")
    .select("id", { count: "exact", head: true })
    .eq("project_id", owned.project.id);
  if ((count ?? 0) >= MAX_SOURCES_PER_PROJECT) {
    return Response.json({ error: "source_limit_reached" }, { status: 400 });
  }

  let title: string;
  let config: Record<string, string>;
  if (input.type === "url") {
    try {
      assertSafeUrlShape(input.url);
    } catch (e) {
      return Response.json(
        { error: "unsafe_url", message: e instanceof UnsafeUrlError ? e.message : "Invalid link." },
        { status: 400 }
      );
    }
    title = new URL(input.url).hostname;
    config = { url: input.url };
  } else {
    if (!isConnectorConfigured(input.type)) {
      return Response.json({ error: "connector_not_configured" }, { status: 400 });
    }
    const { data: account } = await owned.supabase
      .from("connector_accounts")
      .select("id")
      .eq("provider", input.type)
      .maybeSingle();
    if (!account) return Response.json({ error: "connector_not_connected" }, { status: 400 });
    if (input.type === "github" && !REPO_PATTERN.test(input.config.repo ?? "")) {
      return Response.json({ error: "invalid_request", message: "Repository must look like owner/name." }, { status: 400 });
    }
    title = input.title;
    config = input.config;
  }

  const { data: source, error } = await owned.supabase
    .from("project_sources")
    .insert({
      project_id: owned.project.id,
      user_id: guard.user.id,
      source_type: input.type,
      title,
      config,
    })
    .select("*")
    .single();
  if (error || !source) return Response.json({ error: "create_failed" }, { status: 500 });

  const outcome = await syncProjectSource(owned.supabase, guard.user.id, source as ProjectSourceRecord);
  return Response.json({ source, outcome }, { status: 201 });
}

export async function PUT(request: Request, ctx: Ctx): Promise<Response> {
  const params = await ctx.params;
  const guard = await guardRoute({ rateKey: "sync", maxPerMinute: 6, blockGuests: true });
  if ("response" in guard) return guard.response;
  const owned = await ownedProject(params.projectId);
  if (!owned) return Response.json({ error: "project_not_found" }, { status: 404 });
  const parsed = sourceIdSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const { data: source } = await owned.supabase
    .from("project_sources")
    .select("*")
    .eq("id", parsed.data.sourceId)
    .eq("project_id", owned.project.id)
    .maybeSingle();
  if (!source) return Response.json({ error: "source_not_found" }, { status: 404 });
  if ((source as ProjectSourceRecord).sync_status === "syncing") {
    return Response.json({ error: "sync_in_progress" }, { status: 409 });
  }

  const outcome = await syncProjectSource(owned.supabase, guard.user.id, source as ProjectSourceRecord);
  return Response.json({ outcome });
}

export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  const params = await ctx.params;
  const guard = await guardRoute({ rateKey: "projects", maxPerMinute: 60, blockGuests: true });
  if ("response" in guard) return guard.response;
  const owned = await ownedProject(params.projectId);
  if (!owned) return Response.json({ error: "project_not_found" }, { status: 404 });
  const parsed = sourceIdSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  // Synced documents cascade with the source; their chunks cascade with them.
  await owned.supabase
    .from("project_sources")
    .delete()
    .eq("id", parsed.data.sourceId)
    .eq("project_id", owned.project.id);
  return Response.json({ deleted: true });
}
