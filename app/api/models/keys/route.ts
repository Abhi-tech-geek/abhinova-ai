import {
  getAuthenticatedUser,
  UnauthorizedError,
  unauthorizedResponse,
  isGuest,
} from "@/lib/auth";
import { addApiKeySchema, deleteApiKeySchema } from "@/lib/validators/models";
import { checkRateLimit } from "@/lib/rate-limit";
import { validateApiKey, saveApiKey } from "@/lib/models/byok";
import { createClient } from "@/lib/supabase/server";

// BYOK key management. Keys are AES-GCM encrypted before storage and NEVER
// returned raw — masked form only (e.g. "sk-...4f2a"). Never logged.

export async function GET(): Promise<Response> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
  if (isGuest(user)) return Response.json({ error: "guest_not_allowed" }, { status: 403 });

  const supabase = await createClient();
  const { data: keys } = await supabase
    .from("user_api_keys")
    .select("id, provider, key_masked, label, created_at")
    .order("created_at", { ascending: true });
  return Response.json({ keys: keys ?? [] });
}

export async function POST(request: Request): Promise<Response> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
  if (isGuest(user)) return Response.json({ error: "guest_not_allowed" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = addApiKeySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  // Validation makes an outbound provider call — rate limit it.
  const rl = await checkRateLimit(`keys:${user.id}`, 10);
  if (!rl.allowed) {
    return Response.json(
      { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429 }
    );
  }

  const { provider, apiKey, label } = parsed.data;
  const valid = await validateApiKey(provider, apiKey);
  if (!valid) {
    return Response.json({ error: "key_validation_failed" }, { status: 422 });
  }

  const saved = await saveApiKey(user.id, provider, apiKey, label);
  if (!saved) {
    return Response.json({ error: "key_save_failed" }, { status: 500 });
  }
  return Response.json({
    key: { id: saved.id, provider, key_masked: saved.key_masked, label: label ?? null },
  });
}

export async function DELETE(request: Request): Promise<Response> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
  if (isGuest(user)) return Response.json({ error: "guest_not_allowed" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = deleteApiKeySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_api_keys")
    .delete()
    .eq("id", parsed.data.keyId);
  if (error) return Response.json({ error: "delete_failed" }, { status: 500 });
  return Response.json({ deleted: true });
}
