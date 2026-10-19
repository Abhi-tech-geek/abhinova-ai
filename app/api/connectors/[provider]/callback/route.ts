import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { guardRoute } from "@/lib/auth";
import { connectorProviderSchema, oauthCallbackSchema } from "@/lib/validators/connectors";
import {
  exchangeCode,
  saveConnectorAccount,
  stateCookieName,
  statesMatch,
} from "@/lib/connectors/oauth";
import { safeNextPath } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

// OAuth callback: verify the CSRF state cookie, exchange the code server-side,
// store tokens ENCRYPTED, then send the user back. Tokens never reach the
// browser and are never logged.

type Ctx = { params: { provider: string } };

export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  const url = new URL(request.url);
  const provider = connectorProviderSchema.safeParse(params.provider);
  if (!provider.success) return Response.json({ error: "unknown_provider" }, { status: 404 });

  const cookieName = stateCookieName(provider.data);
  const raw = cookies().get(cookieName)?.value;
  let saved: { state?: string; returnTo?: string } = {};
  try {
    saved = raw ? (JSON.parse(raw) as typeof saved) : {};
  } catch {
    saved = {};
  }
  const returnTo = safeNextPath(saved.returnTo ?? null, url.origin, "/projects");
  const back = (status: string) => {
    const res = NextResponse.redirect(
      `${url.origin}${returnTo}${returnTo.includes("?") ? "&" : "?"}${status}`
    );
    res.cookies.delete({ name: cookieName, path: `/api/connectors/${provider.data}` });
    return res;
  };

  const guard = await guardRoute({ rateKey: "connect", maxPerMinute: 10, blockGuests: true });
  if ("response" in guard) return back("connector_error=not_allowed");

  if (url.searchParams.get("error")) return back("connector_error=denied");
  const parsed = oauthCallbackSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success || !saved.state || !statesMatch(saved.state, parsed.data.state)) {
    return back("connector_error=state_mismatch");
  }

  try {
    const tokens = await exchangeCode(provider.data, parsed.data.code, url.origin);
    const supabase = createClient();
    await saveConnectorAccount(supabase, guard.user.id, provider.data, tokens);
    return back(`connected=${provider.data}`);
  } catch {
    return back("connector_error=exchange_failed");
  }
}
