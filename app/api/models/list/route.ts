import {
  getAuthenticatedUser,
  UnauthorizedError,
  unauthorizedResponse,
  isGuest,
} from "@/lib/auth";
import { BUILT_IN_MODELS, PROVIDERS, type Provider, type ModelOption } from "@/lib/models/registry";
import { createClient } from "@/lib/supabase/server";

// Built-in models + the user's configured BYOK models. Masked labels only —
// raw keys never appear in any response.
export async function GET(): Promise<Response> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }

  const models: ModelOption[] = [...BUILT_IN_MODELS];

  if (!isGuest(user)) {
    const supabase = createClient();
    const { data: keys } = await supabase
      .from("user_api_keys")
      .select("id, provider, key_masked, label")
      .order("created_at", { ascending: true });

    for (const key of keys ?? []) {
      const provider = key.provider as Provider;
      for (const model of PROVIDERS[provider].suggestedModels) {
        models.push({
          id: `byok/${key.id}/${model}`,
          label: `${model} (${key.label ?? PROVIDERS[provider].label} · ${key.key_masked})`,
          provider,
          byok: true,
        });
      }
    }
  }

  return Response.json({ models });
}
