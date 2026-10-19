import { encrypt, decrypt } from "@/lib/crypto/encrypt";
import { PROVIDERS, type Provider, type ResolvedModel } from "@/lib/models/registry";
import { createClient } from "@/lib/supabase/server";

// BYOK key handling. SERVER-ONLY. Keys are decrypted only at the moment of the
// AI call, NEVER returned to the client (masked form only), NEVER logged.

export function maskApiKey(apiKey: string): string {
  return `${apiKey.slice(0, 3)}...${apiKey.slice(-4)}`;
}

/**
 * Tiny non-streaming test call to verify a key before saving. Returns false on
 * any failure — the route refuses to store an invalid key.
 */
export async function validateApiKey(
  provider: Provider,
  apiKey: string
): Promise<boolean> {
  const def = PROVIDERS[provider];
  try {
    if (def.openAiCompatUrl) {
      const res = await fetch(def.openAiCompatUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: def.testModel,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
      });
      return res.ok;
    }
    if (provider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${def.testModel}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "ping" }] }],
            generationConfig: { maxOutputTokens: 1 },
          }),
        }
      );
      return res.ok;
    }
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: def.testModel,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      return res.ok;
    }
    return false;
  } catch {
    return false;
  }
}

/** Encrypts and stores a validated key; returns the masked row. */
export async function saveApiKey(
  userId: string,
  provider: Provider,
  apiKey: string,
  label?: string
): Promise<{ id: string; key_masked: string } | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_api_keys")
    .insert({
      user_id: userId,
      provider,
      encrypted_key: encrypt(apiKey),
      key_masked: maskApiKey(apiKey),
      label: label ?? null,
    })
    .select("id, key_masked")
    .single();
  return error ? null : data;
}

/**
 * Resolves a model id to a routing target. RLS scopes the key lookup to the
 * calling user, so one user can never resolve another user's key.
 */
export async function resolveModel(modelId: string): Promise<ResolvedModel | null> {
  const parts = modelId.split("/");

  if (parts[0] === "byok") {
    const [, keyId, ...modelParts] = parts;
    const model = modelParts.join("/"); // openrouter models contain "/"
    if (!keyId || !model) return null;
    const supabase = createClient();
    const { data: row } = await supabase
      .from("user_api_keys")
      .select("provider, encrypted_key")
      .eq("id", keyId)
      .maybeSingle();
    if (!row) return null;
    try {
      return {
        provider: row.provider as Provider,
        model,
        apiKey: decrypt(row.encrypted_key),
      };
    } catch {
      return null; // ENCRYPTION_KEY changed/missing — treat as unresolvable
    }
  }

  const [provider, ...modelParts] = parts;
  const model = modelParts.join("/");
  if ((provider === "groq" || provider === "gemini") && model) {
    return { provider, model }; // built-in: app env key is used
  }
  return null;
}
