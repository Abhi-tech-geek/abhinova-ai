import { guardRoute, isGuest } from "@/lib/auth";
import { createProjectSchema } from "@/lib/validators/projects";
import { GUEST_MAX_PROJECTS, PROJECT_COLUMNS, listProjectsWithStats } from "@/lib/projects/scope";
import { createClient } from "@/lib/supabase/server";

// GET  → the caller's projects with card stats (RLS-scoped).
// POST → create a project (guests: max GUEST_MAX_PROJECTS, enforced here AND in RLS).

export async function GET(): Promise<Response> {
  const guard = await guardRoute({ rateKey: "projects", maxPerMinute: 60 });
  if ("response" in guard) return guard.response;
  const projects = await listProjectsWithStats(createClient());
  return Response.json({ projects });
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardRoute({ rateKey: "projects", maxPerMinute: 60 });
  if ("response" in guard) return guard.response;
  const { user } = guard;

  const body = await request.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const supabase = createClient();
  if (isGuest(user)) {
    const { count } = await supabase.from("projects").select("id", { count: "exact", head: true });
    if ((count ?? 0) >= GUEST_MAX_PROJECTS) {
      return Response.json({ error: "guest_limit_reached" }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      custom_instructions: parsed.data.custom_instructions || null,
      icon: parsed.data.icon,
      color: parsed.data.color,
    })
    .select(PROJECT_COLUMNS)
    .single();
  if (error || !data) return Response.json({ error: "create_failed" }, { status: 500 });
  return Response.json({ project: data }, { status: 201 });
}
