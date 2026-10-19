import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOpenBeta } from "@/lib/beta/config";
import { safeNextPath } from "@/lib/utils";

// Open beta entry: give a first-time visitor an anonymous (guest) session and
// send them straight into the app — no login screen. Middleware routes every
// signed-out page view here. Supabase rate-limits anonymous sign-ins per IP.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNextPath(searchParams.get("next"), origin);

  if (!isOpenBeta()) return NextResponse.redirect(`${origin}/login`);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return NextResponse.redirect(`${origin}${next}`);

  const { error } = await supabase.auth.signInAnonymously();
  if (!error) return NextResponse.redirect(`${origin}${next}`);

  // Usually Supabase's per-IP anonymous sign-in limit. Plain page, no retry loop.
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AbhiNova AI — busy</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#06070d;color:#eef0fa;font-family:system-ui,sans-serif;padding:16px}main{max-width:420px;text-align:center}a{color:#7c8cff}</style></head>
<body><main><h1>AbhiNova AI is busy 🙏</h1><p>Too many new visitors from your network right now. Please try again in a few minutes.</p><p><a href="/">Try again</a></p></main></body></html>`,
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "300" } }
  );
}
