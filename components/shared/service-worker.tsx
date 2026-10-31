"use client";

import { useEffect } from "react";

// Registers /sw.js (offline page only — see public/sw.js). Production only, so
// dev reloads never get stuck behind a worker.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
