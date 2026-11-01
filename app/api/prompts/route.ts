import { guardRoute } from "@/lib/auth";
import { savedPromptSchema, rowIdSchema } from "@/lib/validators/memory";
import { createClient } from "@/lib/supabase/server";
import type { SavedPromptRecord } from "@/types/chat";

// Saved prompts for the "/" menu (migration 007). GET list, POST add,
// DELETE ?id= one. RLS → owner only, max 50.

const notSetUp = (code: string | undefined) => code === "42P01" || code === "PGRST205";
const notSetUpResponse = () => Response.json({ error: "prompts_not_set_up" }, { status: 503 });

export async function GET(): Promise<Response> {
  const guard = await guardRoute({ rateKey: "prompts", maxPerMinute: 60 });
  if ("response" in guard) return guard.response;
  const supabase = await createClient();
  const { data, error } = await supabase.from("saved_prompts").select("id, title, content").order("created_at", { ascending: true });
  if (error) return notSetUp(error.code) ? notSetUpResponse() : Response.json({ error: "list_failed" }, { status: 500 });
  return Response.json({ prompts: (data ?? []) as SavedPromptRecord[] });
}

export async function POST(request: Request): Promise<Response> {
  const guard = await guardRoute({ rateKey: "prompts", maxPerMinute: 30 });
  if ("response" in guard) return guard.response;
  const parsed = savedPromptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_prompts")
    .insert({ user_id: guard.user.id, ...parsed.data })
    .select("id, title, content")
    .single();
  if (error) return notSetUp(error.code) ? notSetUpResponse() : Response.json({ error: "prompts_full" }, { status: 409 });
  return Response.json({ prompt: data as SavedPromptRecord }, { status: 201 });
}

export async function DELETE(request: Request): Promise<Response> {
  const guard = await guardRoute({ rateKey: "prompts", maxPerMinute: 30 });
  if ("response" in guard) return guard.response;
  const id = rowIdSchema.safeParse(new URL(request.url).searchParams.get("id"));
  if (!id.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("saved_prompts").delete().eq("id", id.data).select("id");
  if (error) return notSetUp(error.code) ? notSetUpResponse() : Response.json({ error: "delete_failed" }, { status: 500 });
  if (!data?.length) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
