import { guardRoute } from "@/lib/auth";
import {
  projectIdSchema,
  createNoteSchema,
  updateNoteSchema,
  deleteNoteSchema,
} from "@/lib/validators/projects";
import { getOwnedProject, MAX_NOTES_PER_PROJECT } from "@/lib/projects/scope";
import { createClient } from "@/lib/supabase/server";

// Project memory notes — short permanent facts the project AI always sees.
type Ctx = { params: { projectId: string } };

async function ownedProjectOr404(projectId: string) {
  const id = projectIdSchema.safeParse(projectId);
  if (!id.success) return { response: Response.json({ error: "invalid_project" }, { status: 400 }) };
  const supabase = createClient();
  const project = await getOwnedProject(supabase, id.data);
  if (!project) return { response: Response.json({ error: "project_not_found" }, { status: 404 }) };
  return { supabase, project };
}

export async function GET(_request: Request, { params }: Ctx): Promise<Response> {
  const guard = await guardRoute({ rateKey: "projects", maxPerMinute: 60 });
  if ("response" in guard) return guard.response;
  const owned = await ownedProjectOr404(params.projectId);
  if ("response" in owned) return owned.response!;
  const { data } = await owned.supabase
    .from("project_notes")
    .select("id, content, created_at")
    .eq("project_id", owned.project.id)
    .order("created_at");
  return Response.json({ notes: data ?? [] });
}

export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  const guard = await guardRoute({ rateKey: "projects", maxPerMinute: 60 });
  if ("response" in guard) return guard.response;
  const owned = await ownedProjectOr404(params.projectId);
  if ("response" in owned) return owned.response!;
  const parsed = createNoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const { count } = await owned.supabase
    .from("project_notes")
    .select("id", { count: "exact", head: true })
    .eq("project_id", owned.project.id);
  if ((count ?? 0) >= MAX_NOTES_PER_PROJECT) {
    return Response.json({ error: "note_limit_reached" }, { status: 400 });
  }

  const { data, error } = await owned.supabase
    .from("project_notes")
    .insert({ project_id: owned.project.id, user_id: guard.user.id, content: parsed.data.content })
    .select("id, content, created_at")
    .single();
  if (error || !data) return Response.json({ error: "create_failed" }, { status: 500 });
  return Response.json({ note: data }, { status: 201 });
}

export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  const guard = await guardRoute({ rateKey: "projects", maxPerMinute: 60 });
  if ("response" in guard) return guard.response;
  const owned = await ownedProjectOr404(params.projectId);
  if ("response" in owned) return owned.response!;
  const parsed = updateNoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const { data, error } = await owned.supabase
    .from("project_notes")
    .update({ content: parsed.data.content })
    .eq("id", parsed.data.noteId)
    .eq("project_id", owned.project.id)
    .select("id, content, created_at")
    .single();
  if (error || !data) return Response.json({ error: "note_not_found" }, { status: 404 });
  return Response.json({ note: data });
}

export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  const guard = await guardRoute({ rateKey: "projects", maxPerMinute: 60 });
  if ("response" in guard) return guard.response;
  const owned = await ownedProjectOr404(params.projectId);
  if ("response" in owned) return owned.response!;
  const parsed = deleteNoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  await owned.supabase
    .from("project_notes")
    .delete()
    .eq("id", parsed.data.noteId)
    .eq("project_id", owned.project.id);
  return Response.json({ deleted: true });
}
