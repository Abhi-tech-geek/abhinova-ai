import {
  getAuthenticatedUser,
  UnauthorizedError,
  unauthorizedResponse,
} from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { deleteMyDataSchema } from "@/lib/validators/account";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// "Delete my data": removes everything the signed-in user (guest or account)
// has stored — chats, files, projects, QA/code history, wellness entries, API
// keys, connector links and feedback. Runs with the user's own client, so RLS
// limits every delete to their rows; only feedback (no client privileges) goes
// through the service role, filtered to this user. The account/session and the
// beta usage counters stay, so deleting data never resets a limit.

// Child tables (messages, chunks, notes, sources) go with their parents via
// ON DELETE CASCADE.
const USER_TABLES = [
  "conversations",
  "documents",
  "projects",
  "qa_artifacts",
  "code_docs",
  "mood_logs",
  "journal_entries",
  "wellness_insights",
  "user_api_keys",
  "connector_accounts",
] as const;

export async function DELETE(request: Request): Promise<Response> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }

  const body = await request.json().catch(() => null);
  if (!deleteMyDataSchema.safeParse(body).success) {
    return Response.json({ error: "confirmation_required" }, { status: 400 });
  }

  const rl = await checkRateLimit(`account-delete:${user.id}`, 3);
  if (!rl.allowed) {
    return Response.json(
      { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const supabase = await createClient();

  // Uploaded files first (storage/{user_id}/…), while we still know they exist.
  const folder = user.id;
  for (;;) {
    const { data: files, error } = await supabase.storage.from("documents").list(folder, { limit: 1000 });
    if (error) return Response.json({ error: "delete_failed", step: "files" }, { status: 500 });
    if (!files || files.length === 0) break;
    const { error: removeError } = await supabase.storage
      .from("documents")
      .remove(files.map((f) => `${folder}/${f.name}`));
    if (removeError) return Response.json({ error: "delete_failed", step: "files" }, { status: 500 });
    if (files.length < 1000) break;
  }

  for (const table of USER_TABLES) {
    const { error } = await supabase.from(table).delete().eq("user_id", user.id);
    if (error) return Response.json({ error: "delete_failed", step: table }, { status: 500 });
  }

  const { error: feedbackError } = await createAdminClient()
    .from("feedback")
    .delete()
    .eq("user_id", user.id);
  if (feedbackError) return Response.json({ error: "delete_failed", step: "feedback" }, { status: 500 });

  return Response.json({ deleted: true });
}
