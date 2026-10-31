import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatMessageRecord } from "@/types/chat";

/**
 * Adds the caller's 👍/👎 to loaded messages (RLS-scoped). Before migration
 * 007 the table doesn't exist — messages are returned unrated.
 */
export async function withRatings(
  supabase: SupabaseClient,
  messages: ChatMessageRecord[]
): Promise<ChatMessageRecord[]> {
  const ids = messages.filter((m) => m.role === "assistant").map((m) => m.id);
  if (ids.length === 0) return messages;
  const { data, error } = await supabase.from("message_feedback").select("message_id, rating").in("message_id", ids);
  if (error || !data) return messages;
  const ratings = new Map(data.map((r) => [r.message_id as string, r.rating as 1 | -1]));
  return messages.map((m) => (ratings.has(m.id) ? { ...m, rating: ratings.get(m.id) } : m));
}
