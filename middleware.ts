import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isOpenBeta } from "@/lib/beta/config";
import { qaToolIdSchema } from "@/lib/validators/qa";

// Route groups don't appear in URLs, so (workspace) and (wellness) routes are
// protected by path prefix. Anonymous (guest) sessions count as authenticated —
// feature restrictions for guests are enforced per-surface, not here.
const PROTECTED_PREFIXES = [
  "/chat",
  "/qa-studio",
  "/documents",
  "/code-studio",
  "/settings",
  "/talk",
  "/mood",
  "/journal",
  "/progress",
  "/projects",
];

// Link-preview bots and crawlers (never auto-create guests for them).
const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|curl|wget|python-requests|headless/i;

function redirectTo(request: NextRequest, pathAndQuery: string) {
  return NextResponse.redirect(new URL(pathAndQuery, request.url));
}

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Pass through until Supabase env vars are configured (fresh clone / CI).
  if (!supabaseUrl || !supabaseAnonKey) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Also refreshes an expired session — do not remove even for public pages.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Unknown QA tool → real 404. The page's notFound() runs after the
  // workspace loading.tsx has already streamed a 200 (audit bug B7).
  const qaTool = path.match(/^\/qa-studio\/([^/]+)\/?$/)?.[1];
  if (qaTool && !qaToolIdSchema.safeParse(qaTool).success) {
    return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );

  // Open beta: no login/signup screens — signed-out visitors get a guest
  // session automatically via /auth/guest (see lib/beta/config.ts).
  if (isOpenBeta()) {
    const isAuthPage = path === "/login" || path === "/signup";
    if (user && isAuthPage) return redirectTo(request, "/chat");
    if (!user && (isProtected || isAuthPage || path === "/")) {
      // Crawlers, link previews and HEAD/prefetch requests must not mint a
      // new anonymous user on every hit.
      if (request.method !== "GET" || BOT_UA.test(request.headers.get("user-agent") ?? "")) {
        return new NextResponse("AbhiNova AI — open beta", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" },
        });
      }
      const next = isProtected ? path : "/chat";
      return redirectTo(request, `/auth/guest?next=${encodeURIComponent(next)}`);
    }
    return response;
  }

  if (!user && isProtected) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
