import { guardRoute } from "@/lib/auth";
import {
  projectIdSchema,
  updateProjectSchema,
  deleteProjectQuerySchema,
} from "@/lib/validators/projects";
import { getOwnedProject, loadProjectDetail, PROJECT_COLUMNS } from "@/lib/projects/scope";
import { createClient } from "@/lib/supabase/server";

// GET    → project + notes + documents + sources + chats (all RLS-scoped)
// PATCH  → edit fields / archive / attach or detach existing documents
// DELETE → remove project + notes + sources (and their synced items);
//          ?deleteDocuments=true also deletes uploaded files, chunks, storage.

type Ctx = { params: { projectId: string } };

export async function GET(_request: Request, { params }: Ctx): Promise<Response> {
  const guard = await guardRoute({ rateKey: "projects", maxPerMinute: 60 });
  if ("response" in guard) return guard.response;
  const id = projectIdSchema.safeParse(params.projectId);
  if (!id.success) return Response.json({ error: "invalid_project" }, { status: 400 });

  const detail = await loadProjectDetail(createClient(), id.data);
  if (!detail) return Response.json({ error: "project_not_found" }, { status: 404 });
  return Response.json(detail);
}

export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  const guard = await guardRoute({ rateKey: "projects", maxPerMinute: 60 });
  if ("response" in guard) return guard.response;
  const id = projectIdSchema.safeParse(params.projectId);
  if (!id.success) return Response.json({ error: "invalid_project" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = createClient();
  const project = await getOwnedProject(supabase, id.data);
  if (!project) return Response.json({ error: "project_not_found" }, { status: 404 });

  const { attachDocumentIds, detachDocumentId, ...fields } = parsed.data;

  if (attachDocumentIds?.length) {
    // RLS restricts the update to the caller's own documents.
    await supabase.from("documents").update({ project_id: project.id }).in("id", attachDocumentIds);
  }
  if (detachDocumentId) {
    await supabase
      .from("documents")
      .update({ project_id: null })
      .eq("id", detachDocumentId)
      .eq("project_id", project.id)
      .is("source_id", null);
  }

  if (Object.keys(fields).length > 0) {
    const { data, error } = await supabase
      .from("projects")
      .update(fields)
      .eq("id", project.id)
      .select(PROJECT_COLUMNS)
      .single();
    if (error || !data) return Response.json({ error: "update_failed" }, { status: 500 });
    return Response.json({ project: data });
  }
  return Response.json({ project });
}

export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  const guard = await guardRoute({ rateKey: "projects", maxPerMinute: 30 });
  if ("response" in guard) return guard.response;
  const id = projectIdSchema.safeParse(params.projectId);
  if (!id.success) return Response.json({ error: "invalid_project" }, { status: 400 });
  const query = deleteProjectQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!query.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const supabase = createClient();
  const project = await getOwnedProject(supabase, id.data);
  if (!project) return Response.json({ error: "project_not_found" }, { status: 404 });

  if (query.data.deleteDocuments === "true") {
    const { data: docs } = await supabase
      .from("documents")
      .select("id, storage_path")
      .eq("project_id", project.id);
    const paths = (docs ?? [])
      .map((d) => d.storage_path as string | null)
      .filter((p): p is string => Boolean(p));
    if (paths.length) await supabase.storage.from("documents").remove(paths);
    if (docs?.length) {
      // Chunks cascade with their document rows.
      await supabase.from("documents").delete().in("id", docs.map((d) => d.id));
    }
  }

  // Notes + sources cascade (synced items cascade with their source);
  // remaining documents/chats detach (project_id → null).
  const { error } = await supabase.from("projects").delete().eq("id", project.id);
  if (error) return Response.json({ error: "delete_failed" }, { status: 500 });
  return Response.json({ deleted: true });
}
