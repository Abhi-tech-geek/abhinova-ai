import { guardRoute } from "@/lib/auth";
import { chatSearchSchema } from "@/lib/validators/chat";
import { createClient } from "@/lib/supabase/server";
import type { ChatSearchResult } from "@/types/chat";

// Search the caller's workspace chats by title and message text (Ctrl+K).
// RLS keeps it to the caller's rows. The term is used only as an ilike
// pattern (wildcards escaped) — never spliced into a PostgREST filter string.

const MAX_RESULTS = 20;

export async function GET(request: Request): Promise<Response> {
  const guard = await guardRoute({ rateKey: "chat-search", maxPerMinute: 60 });
  if ("response" in guard) return guard.response;
  const q = chatSearchSchema.safeParse(new URL(request.url).searchParams.get("q") ?? "");
  if (!q.success) return Response.json({ results: [] });

  const pattern = `%${q.data.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const supabase = await createClient();
  const [byTitle, byText] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, title, project_id, updated_at")
      .eq("mode", "workspace")
      .ilike("title", pattern)
      .order("updated_at", { ascending: false })
      .limit(MAX_RESULTS),
    supabase
      .from("messages")
      .select("conversation_id, content")
      .ilike("content", pattern)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  // First matching message per chat → its snippet.
  const snippets = new Map<string, string>();
  for (const m of byText.data ?? []) {
    if (!snippets.has(m.conversation_id as string)) snippets.set(m.conversation_id as string, m.content as string);
  }
  const textOnlyIds = [...snippets.keys()].filter((id) => !(byTitle.data ?? []).some((c) => c.id === id));
  const { data: textChats } = textOnlyIds.length
    ? await supabase
        .from("conversations")
        .select("id, title, project_id, updated_at")
        .eq("mode", "workspace") // wellness chats never show up here
        .in("id", textOnlyIds)
    : { data: [] };

  const results: ChatSearchResult[] = [...(byTitle.data ?? []), ...(textChats ?? [])]
    .slice(0, MAX_RESULTS)
    .map((c) => ({
      id: c.id as string,
      title: c.title as string,
      projectId: (c.project_id as string | null) ?? null,
      snippet: snippets.has(c.id as string) ? snippetAround(snippets.get(c.id as string)!, q.data) : null,
    }));
  return Response.json({ results });
}

/** ~120 characters around the first match. */
function snippetAround(text: string, term: string): string {
  const flat = text.replace(/\s+/g, " ");
  const at = flat.toLowerCase().indexOf(term.toLowerCase());
  const start = Math.max(0, at - 50);
  return `${start > 0 ? "…" : ""}${flat.slice(start, start + 120)}${start + 120 < flat.length ? "…" : ""}`;
}
