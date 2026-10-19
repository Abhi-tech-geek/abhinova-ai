import { randomBytes, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encrypt, decrypt } from "@/lib/crypto/encrypt";
import { getConnector } from "@/lib/connectors/registry";
import type { ConnectorProvider, ConnectorStatus } from "@/types/connectors";

// OAuth flow + encrypted token storage/refresh. SERVER-ONLY.
// Rules (CLAUDE.md → Connector Security): tokens are AES-GCM encrypted before
// insert, decrypted only server-side at call time, never sent to the client,
// never logged. Least-privilege scopes come from the registry.

interface ProviderOAuthConfig {
  clientIdEnv: string;
  clientSecretEnv: string;
  authorizeUrl: string;
  tokenUrl: string;
  extraAuthorizeParams?: Record<string, string>;
  /** Token endpoint wants HTTP Basic client auth + JSON (Notion). */
  basicAuthJson?: boolean;
}

const OAUTH: Record<ConnectorProvider, ProviderOAuthConfig> = {
  jira: {
    clientIdEnv: "ATLASSIAN_CLIENT_ID",
    clientSecretEnv: "ATLASSIAN_CLIENT_SECRET",
    authorizeUrl: "https://auth.atlassian.com/authorize",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    extraAuthorizeParams: { audience: "api.atlassian.com", prompt: "consent" },
  },
  github: {
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    extraAuthorizeParams: { allow_signup: "false" },
  },
  notion: {
    clientIdEnv: "NOTION_CLIENT_ID",
    clientSecretEnv: "NOTION_CLIENT_SECRET",
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    extraAuthorizeParams: { owner: "user" },
    basicAuthJson: true,
  },
  gdrive: {
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    extraAuthorizeParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
};

export function isConnectorConfigured(provider: ConnectorProvider): boolean {
  const cfg = OAUTH[provider];
  return Boolean(process.env[cfg.clientIdEnv] && process.env[cfg.clientSecretEnv]);
}

function credentials(provider: ConnectorProvider): { clientId: string; clientSecret: string } {
  const cfg = OAUTH[provider];
  const clientId = process.env[cfg.clientIdEnv];
  const clientSecret = process.env[cfg.clientSecretEnv];
  if (!clientId || !clientSecret) throw new Error(`${provider} connector is not configured`);
  return { clientId, clientSecret };
}

export function callbackUrl(origin: string, provider: ConnectorProvider): string {
  return `${origin}/api/connectors/${provider}/callback`;
}

// ---------------------------------------------------------------------------
// CSRF state: random value in an httpOnly cookie, echoed back by the provider.
// ---------------------------------------------------------------------------
export const stateCookieName = (provider: ConnectorProvider) => `anv_oauth_${provider}`;

export function newState(): string {
  return randomBytes(24).toString("hex");
}

export function statesMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function buildAuthorizeUrl(provider: ConnectorProvider, origin: string, state: string): string {
  const cfg = OAUTH[provider];
  const { clientId } = credentials(provider);
  const scopes = getConnector(provider)?.scopes ?? [];
  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl(origin, provider));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  // Notion's capabilities live in the integration settings, not the URL.
  if (provider !== "notion" && scopes.length > 0) url.searchParams.set("scope", scopes.join(" "));
  for (const [k, v] of Object.entries(cfg.extraAuthorizeParams ?? {})) url.searchParams.set(k, v);
  return url.toString();
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string | null;
  label: string | null;
  metadata: Record<string, string>;
}

interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
  workspace_name?: string;
}

async function postToken(provider: ConnectorProvider, params: Record<string, string>): Promise<RawTokenResponse> {
  const cfg = OAUTH[provider];
  const { clientId, clientSecret } = credentials(provider);
  let res: Response;
  if (cfg.basicAuthJson) {
    res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(params),
    });
  } else if (provider === "jira") {
    res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...params, client_id: clientId, client_secret: clientSecret }),
    });
  } else {
    res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ ...params, client_id: clientId, client_secret: clientSecret }),
    });
  }
  const json = (await res.json().catch(() => ({}))) as RawTokenResponse;
  if (!res.ok || !json.access_token) {
    // Status only — provider error bodies can echo request data.
    throw new Error(`Token exchange failed (${res.status})`);
  }
  return json;
}

/** Provider-specific account details fetched once after connecting. */
async function accountDetails(
  provider: ConnectorProvider,
  accessToken: string,
  raw: RawTokenResponse
): Promise<{ label: string | null; metadata: Record<string, string> }> {
  if (provider === "jira") {
    const res = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    const sites = (await res.json().catch(() => [])) as { id: string; url: string; name: string }[];
    const site = Array.isArray(sites) ? sites[0] : undefined;
    if (!site) throw new Error("No Jira site is available for this account");
    return { label: site.name, metadata: { cloudId: site.id, siteUrl: site.url } };
  }
  if (provider === "github") {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json" },
    });
    const user = (await res.json().catch(() => ({}))) as { login?: string };
    return { label: user.login ?? null, metadata: {} };
  }
  if (provider === "notion") {
    return { label: raw.workspace_name ?? "Notion workspace", metadata: {} };
  }
  return { label: "Google Drive", metadata: {} };
}

export async function exchangeCode(provider: ConnectorProvider, code: string, origin: string): Promise<TokenSet> {
  const raw = await postToken(provider, {
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl(origin, provider),
  });
  const details = await accountDetails(provider, raw.access_token!, raw);
  return {
    accessToken: raw.access_token!,
    refreshToken: raw.refresh_token ?? null,
    expiresAt: raw.expires_in ? new Date(Date.now() + raw.expires_in * 1000).toISOString() : null,
    scopes: raw.scope ?? null,
    label: details.label,
    metadata: details.metadata,
  };
}

/** Encrypt + upsert the connection (one account per provider per user). */
export async function saveConnectorAccount(
  supabase: SupabaseClient,
  userId: string,
  provider: ConnectorProvider,
  tokens: TokenSet
): Promise<void> {
  const { error } = await supabase.from("connector_accounts").upsert(
    {
      user_id: userId,
      provider,
      encrypted_access_token: encrypt(tokens.accessToken),
      encrypted_refresh_token: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      expires_at: tokens.expiresAt,
      scopes: tokens.scopes,
      account_label: tokens.label,
      metadata: tokens.metadata,
    },
    { onConflict: "user_id,provider" }
  );
  if (error) throw new Error("Could not save the connection");
}

export interface ConnectorAuth {
  accessToken: string;
  metadata: Record<string, string>;
}

/** Decrypts the token for a server-side API call, refreshing if expired. */
export async function getConnectorAuth(
  supabase: SupabaseClient,
  provider: ConnectorProvider
): Promise<ConnectorAuth | null> {
  const { data: row } = await supabase
    .from("connector_accounts")
    .select("id, encrypted_access_token, encrypted_refresh_token, expires_at, metadata")
    .eq("provider", provider)
    .maybeSingle();
  if (!row) return null;

  const metadata = (row.metadata ?? {}) as Record<string, string>;
  const expiresAt = row.expires_at ? new Date(row.expires_at as string).getTime() : null;
  const stillValid = expiresAt === null || expiresAt - Date.now() > 60_000;
  if (stillValid) {
    return { accessToken: decrypt(row.encrypted_access_token as string), metadata };
  }
  if (!row.encrypted_refresh_token) return null;

  const raw = await postToken(provider, {
    grant_type: "refresh_token",
    refresh_token: decrypt(row.encrypted_refresh_token as string),
  });
  // Atlassian rotates refresh tokens — always store the newest one.
  await supabase
    .from("connector_accounts")
    .update({
      encrypted_access_token: encrypt(raw.access_token!),
      ...(raw.refresh_token ? { encrypted_refresh_token: encrypt(raw.refresh_token) } : {}),
      expires_at: raw.expires_in ? new Date(Date.now() + raw.expires_in * 1000).toISOString() : null,
    })
    .eq("id", row.id);
  return { accessToken: raw.access_token!, metadata };
}

/**
 * Best-effort revoke at the provider, then delete the stored tokens. Returns
 * whether provider-side revocation succeeded (some providers have no API for
 * it — the UI then tells the user where to remove the app manually).
 */
export async function disconnectConnector(
  supabase: SupabaseClient,
  provider: ConnectorProvider
): Promise<{ revoked: boolean }> {
  let revoked = false;
  try {
    const auth = await getConnectorAuth(supabase, provider);
    if (auth && provider === "gdrive") {
      const res = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(auth.accessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      revoked = res.ok;
    } else if (auth && provider === "github") {
      const { clientId, clientSecret } = credentials(provider);
      const res = await fetch(`https://api.github.com/applications/${clientId}/grant`, {
        method: "DELETE",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_token: auth.accessToken }),
      });
      revoked = res.ok || res.status === 404;
    }
  } catch {
    revoked = false;
  }
  await supabase.from("connector_accounts").delete().eq("provider", provider);
  return { revoked };
}

/** Where users remove the app manually when there's no revoke API. */
export const MANUAL_REVOKE_URL: Record<ConnectorProvider, string> = {
  jira: "https://id.atlassian.com/manage-profile/apps",
  github: "https://github.com/settings/applications",
  notion: "https://www.notion.so/profile/integrations",
  gdrive: "https://myaccount.google.com/connections",
};

/** Per-provider status for the UI — configured / connected / account label. */
export async function getConnectorStatuses(supabase: SupabaseClient): Promise<ConnectorStatus[]> {
  const { data } = await supabase.from("connector_accounts").select("provider, account_label");
  const rows = (data ?? []) as { provider: ConnectorProvider; account_label: string | null }[];
  return (["jira", "github", "notion", "gdrive"] as ConnectorProvider[]).map((id) => {
    const row = rows.find((r) => r.provider === id);
    return {
      id,
      configured: isConnectorConfigured(id),
      connected: Boolean(row),
      accountLabel: row?.account_label ?? null,
    };
  });
}
