import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { conversationIdSchema } from "@/lib/validators/chat";
import { ChatPanel } from "@/components/workspace/chat-panel";
import type { ChatMessageRecord } from "@/types/chat";

export default async function ConversationPage({
  params: paramsPromise,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const params = await paramsPromise;
  const parsed = conversationIdSchema.safeParse(params.conversationId);
  if (!parsed.success) notFound();
  const conversationId = parsed.data;

  const supabase = await createClient();
  // RLS: only the owner's conversation resolves.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) notFound();
  // Project chats live under their project (context bar, scoped retrieval).
  if (conversation.project_id) {
    redirect(`/projects/${conversation.project_id}/chat/${conversationId}`);
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  return (
    <ChatPanel
      // Remount per conversation so switching chats never shows stale state.
      key={conversationId}
      conversationId={conversationId}
      initialMessages={(messages ?? []) as ChatMessageRecord[]}
    />
  );
}
