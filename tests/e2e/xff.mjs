// Preload (node --import) for local test runs:
// 1. gives this process its own fake client IP on localhost only, so the
//    per-IP beta quota of earlier runs doesn't block it (Vercel ignores
//    client-supplied x-forwarded-for, so this has no effect there);
// 2. waits and retries when Supabase rate-limits anonymous sign-ups (429),
//    instead of failing the whole suite.
const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
    const headers = new Headers(init.headers ?? {});
    if (!headers.has("x-forwarded-for")) headers.set("x-forwarded-for", ip);
    init = { ...init, headers };
  }
  if (url.includes("/auth/v1/signup")) {
    for (let i = 0; i < 40; i++) {
      const r = await realFetch(input, init);
      if (r.status !== 429) return r;
      process.stderr.write(`[xff] supabase sign-up rate limited, waiting 60s (${i + 1})\n`);
      await new Promise((res) => setTimeout(res, 60_000));
    }
  }
  return realFetch(input, init);
};
