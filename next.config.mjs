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
  // No remote images: AI replies render image links instead of loading them,
  // so a crafted image URL can't carry data out of the page (audit bug B2).
  "img-src 'self' data: blob:",
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
  // We never use next/image. Turning the optimizer off removes the
  // /_next/image endpoint, which the open Next 14 RCE/DoS advisories target
  // (audit bug B5) until the Next 16 upgrade.
  images: { unoptimized: true },
  // Don't advertise the framework/version in every response.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/code-studio", headers: crossOriginIsolation },
      { source: "/code-studio/:path*", headers: crossOriginIsolation },
    ];
  },
};

export default nextConfig;
