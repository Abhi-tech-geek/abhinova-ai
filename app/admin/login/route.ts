import { NextResponse } from "next/server";
import { ADMIN_COOKIE, ADMIN_COOKIE_MAX_AGE, adminCookieValue, isValidAdminKey } from "@/lib/admin/auth";
import { adminLoginSchema } from "@/lib/validators/admin";
import { checkRateLimit } from "@/lib/rate-limit";

const ATTEMPTS_PER_MINUTE = 5;

// POST (form) → check the owner key; on success set the admin cookie.
// Always redirects back to /admin (with ?error=… on failure).
export async function POST(request: Request) {
  const url = new URL(request.url);
  const back = (query = "") => NextResponse.redirect(new URL(`/admin${query}`, url.origin), 303);

  const ip =
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const rl = await checkRateLimit(`admin-login:${ip}`, ATTEMPTS_PER_MINUTE);
  if (!rl.allowed) return back("?error=slow_down");

  const form = await request.formData().catch(() => null);
  const parsed = adminLoginSchema.safeParse({ key: form?.get("key") });
  if (!parsed.success || !isValidAdminKey(parsed.data.key)) return back("?error=wrong_key");

  const value = adminCookieValue();
  if (!value) return back("?error=not_configured");
  const res = back();
  res.cookies.set(ADMIN_COOKIE, value, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "strict",
    path: "/admin",
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });
  return res;
}
