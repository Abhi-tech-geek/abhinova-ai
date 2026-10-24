import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// SERVER-ONLY. Owner access to /admin without user accounts (the open beta has
// none): a secret ADMIN_DASHBOARD_TOKEN env var. After one correct entry the
// browser keeps an httpOnly cookie holding an HMAC of the token — never the
// token itself — scoped to /admin. Unset token = dashboard disabled.

export const ADMIN_COOKIE = "anv_admin";
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function token(): string | null {
  const t = process.env.ADMIN_DASHBOARD_TOKEN?.trim();
  return t && t.length >= 16 ? t : null;
}

export function isAdminConfigured(): boolean {
  return token() !== null;
}

/** Value stored in the cookie: HMAC(token), so a leaked cookie can't reveal the token. */
export function adminCookieValue(): string | null {
  const t = token();
  return t ? createHmac("sha256", t).update("abhinova-admin-v1").digest("hex") : null;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Constant-time check of a submitted key against ADMIN_DASHBOARD_TOKEN. */
export function isValidAdminKey(submitted: string): boolean {
  const t = token();
  if (!t) return false;
  // Compare fixed-length digests so the key length isn't leaked by timing.
  const digest = (s: string) => createHmac("sha256", "abhinova-admin-compare").update(s).digest("hex");
  return safeEqual(digest(submitted), digest(t));
}

/** True when the current request carries a valid admin cookie. */
export function isAdminSession(): boolean {
  const expected = adminCookieValue();
  const got = cookies().get(ADMIN_COOKIE)?.value;
  return !!expected && !!got && safeEqual(got, expected);
}
