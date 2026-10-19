// Content-Security-Policy: strict but functional —
// - supabase: API/auth/storage + realtime websockets
// - AI provider calls are server-side only, so they DON'T need CSP entries
// - webcontainer-api.io: WebContainers preview/runtime frames (Code Studio)
// - 'unsafe-inline'/'unsafe-eval' script-src: required by Next.js hydration
//   and WebContainers; tightening to nonces is a future improvement.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.webcontainer-api.io https://*.staticblitz.com blob: data:",
  "frame-src 'self' https://*.webcontainer-api.io",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=()" },
];

const crossOriginIsolation = [
  // WebContainers need SharedArrayBuffer → cross-origin isolation.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/code-studio", headers: crossOriginIsolation },
      { source: "/code-studio/:path*", headers: crossOriginIsolation },
    ];
  },
};

export default nextConfig;
