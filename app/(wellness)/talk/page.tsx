import { createClient } from "@/lib/supabase/server";
import { TalkPanel } from "@/components/wellness/talk-panel";
import type { WellnessMessage } from "@/types/wellness";

export default async function TalkPage() {
  const supabase = createClient();

  // Resume the latest un-ended wellness session, if any (RLS-scoped).
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("mode", "wellness")
    .is("summary", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let messages: WellnessMessage[] = [];
  if (conversation) {
    const { data: rows } = await supabase
      .from("messages")
      .select("id, role, content")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true });
    messages = (rows ?? []).filter(
      (r): r is WellnessMessage => r.role === "user" || r.role === "assistant"
    );
  }

  // Past (ended) sessions with their summaries, for the Sessions list.
  const { data: pastSessions } = await supabase
    .from("conversations")
    .select("id, summary, updated_at")
    .eq("mode", "wellness")
    .not("summary", "is", null)
    .order("updated_at", { ascending: false })
    .limit(10);

  return (
    <main className="h-[calc(100vh-49px)]">
      <TalkPanel
        initialConversationId={conversation?.id ?? null}
        initialMessages={messages}
        pastSessions={(pastSessions ?? []).map((s) => ({
          id: s.id as string,
          summary: (s.summary as string) ?? "",
          updatedAt: s.updated_at as string,
        }))}
      />
    </main>
  );
}
