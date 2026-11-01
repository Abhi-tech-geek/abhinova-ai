import { guardRoute } from "@/lib/auth";
import { memoryAddSchema, memoryToggleSchema, rowIdSchema } from "@/lib/validators/memory";
import { createClient } from "@/lib/supabase/server";
import type { MemoryRecord } from "@/types/chat";

// Memory: short facts the user asked AbhiNova to remember (migration 007).
// Used in chats only while profiles.memory_enabled is on. GET list + switch,
// POST add, PATCH on/off, DELETE ?id= one fact. RLS → owner only, max 30.

const notSetUp = (code: string | undefined) => code === "42P01" || code === "PGRST205" || code === "42703";
const notSetUpResponse = () => Response.json({ error: "memory_not_set_up" }, { status: 503 });

async function start() {
  const guard = await guardRoute({ rateKey: "memory", maxPerMinute: 30 });
  if ("response" in guard) return guard;
  return { user: guard.user, supabase: await createClient() };
}

export async function GET(): Promise<Response> {
  const s = await start();
  if ("response" in s) return s.response;
  const [profile, memories] = await Promise.all([
    s.supabase.from("profiles").select("memory_enabled").eq("id", s.user.id).maybeSingle(),
    s.supabase.from("user_memories").select("id, content, created_at").order("created_at", { ascending: true }),
  ]);
  if (notSetUp(profile.error?.code) || notSetUp(memories.error?.code)) return notSetUpResponse();
  return Response.json({
    enabled: profile.data?.memory_enabled === true,
    memories: (memories.data ?? []) as MemoryRecord[],
  });
}

export async function POST(request: Request): Promise<Response> {
  const s = await start();
  if ("response" in s) return s.response;
  const parsed = memoryAddSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { data, error } = await s.supabase
    .from("user_memories")
    .insert({ user_id: s.user.id, content: parsed.data.content })
    .select("id, content, created_at")
    .single();
  if (error) {
    if (notSetUp(error.code)) return notSetUpResponse();
    // RLS insert check: the 30-fact cap.
    return Response.json({ error: "memory_full" }, { status: 409 });
  }
  if (parsed.data.enable) {
    await s.supabase.from("profiles").update({ memory_enabled: true }).eq("id", s.user.id);
  }
  return Response.json({ memory: data as MemoryRecord }, { status: 201 });
}

export async function PATCH(request: Request): Promise<Response> {
  const s = await start();
  if ("response" in s) return s.response;
  const parsed = memoryToggleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { error } = await s.supabase.from("profiles").update({ memory_enabled: parsed.data.enabled }).eq("id", s.user.id);
  if (error) return notSetUp(error.code) ? notSetUpResponse() : Response.json({ error: "update_failed" }, { status: 500 });
  return Response.json({ enabled: parsed.data.enabled });
}

export async function DELETE(request: Request): Promise<Response> {
  const s = await start();
  if ("response" in s) return s.response;
  const id = rowIdSchema.safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { data, error } = await s.supabase.from("user_memories").delete().eq("id", id.data).select("id");
  if (error) return notSetUp(error.code) ? notSetUpResponse() : Response.json({ error: "delete_failed" }, { status: 500 });
  if (!data?.length) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
