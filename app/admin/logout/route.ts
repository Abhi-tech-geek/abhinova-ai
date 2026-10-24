import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin/auth";

// POST (form) → forget the admin cookie on this browser.
export async function POST(request: Request) {
  const res = NextResponse.redirect(new URL("/admin", new URL(request.url).origin), 303);
  res.cookies.set(ADMIN_COOKIE, "", { path: "/admin", maxAge: 0 });
  return res;
}
