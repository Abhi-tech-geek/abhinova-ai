"use client";

import { useEffect, useState } from "react";

/**
 * False during SSR and the hydration pass, true right after. Use it to gate
 * output that depends on the viewer's timezone/locale (dates, "Today" groups):
 * the server (UTC on Vercel) and the browser would otherwise render different
 * text and trigger a React hydration error.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
