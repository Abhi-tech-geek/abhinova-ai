import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Daily Vercel Cron (vercel.json): one tiny database read so the free Supabase
// project never counts as idle — it pauses after 7 days without activity,
// which takes the whole site down. Vercel sends "Authorization: Bearer
// <CRON_SECRET>"; without that secret configured the endpoint stays closed.

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const t0 = Date.now();
  const { error } = await createAdminClient()
    .from("profiles")
    .select("id", { count: "exact", head: true });
  if (error) {
    console.error(`[keepalive] database ping failed: ${error.message}`);
    return Response.json({ ok: false }, { status: 502 });
  }
  return Response.json({ ok: true, ms: Date.now() - t0 });
}
