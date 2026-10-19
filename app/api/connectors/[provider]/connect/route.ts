import { NextResponse } from "next/server";
import { guardRoute } from "@/lib/auth";
import { connectorProviderSchema, connectReturnSchema } from "@/lib/validators/connectors";
import {
  buildAuthorizeUrl,
  disconnectConnector,
  isConnectorConfigured,
  newState,
  stateCookieName,
  MANUAL_REVOKE_URL,
} from "@/lib/connectors/oauth";
import { safeNextPath } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

// GET    → start OAuth: CSRF state in an httpOnly cookie, redirect to provider.
// DELETE → disconnect: revoke at provider (where possible) + delete tokens;
//          ?deleteData=true also removes every source synced via it.
// Guests can never connect (403).

type Ctx = { params: { provider: string } };

export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  const guard = await guardRoute({ rateKey: "connect", maxPerMinute: 10, blockGuests: true });
  if ("response" in guard) return guard.response;
  const provider = connectorProviderSchema.safeParse(params.provider);
  if (!provider.success) return Response.json({ error: "unknown_provider" }, { status: 404 });

  const url = new URL(request.url);
  const query = connectReturnSchema.safeParse(Object.fromEntries(url.searchParams));
  const returnTo = safeNextPath(query.success ? query.data.returnTo ?? null : null, url.origin, "/projects");

  if (!isConnectorConfigured(provider.data)) {
    return NextResponse.redirect(`${url.origin}${returnTo}${returnTo.includes("?") ? "&" : "?"}connector_error=not_configured`);
  }

  const state = newState();
  const response = NextResponse.redirect(buildAuthorizeUrl(provider.data, url.origin, state));
  response.cookies.set(stateCookieName(provider.data), JSON.stringify({ state, returnTo }), {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: `/api/connectors/${provider.data}`,
    maxAge: 600,
  });
  return response;
}

export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  const guard = await guardRoute({ rateKey: "connect", maxPerMinute: 10, blockGuests: true });
  if ("response" in guard) return guard.response;
  const provider = connectorProviderSchema.safeParse(params.provider);
  if (!provider.success) return Response.json({ error: "unknown_provider" }, { status: 404 });

  const supabase = createClient();
  const deleteData = new URL(request.url).searchParams.get("deleteData") === "true";
  if (deleteData) {
    // Synced documents + chunks cascade with their sources.
    await supabase.from("project_sources").delete().eq("source_type", provider.data);
  }
  const { revoked } = await disconnectConnector(supabase, provider.data);
  return Response.json({
    disconnected: true,
    revoked,
    ...(revoked ? {} : { manualRevokeUrl: MANUAL_REVOKE_URL[provider.data] }),
  });
}
