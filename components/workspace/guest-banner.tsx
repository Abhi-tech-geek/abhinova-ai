"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BETA_LIMITS, BETA_USAGE_EVENT, isOpenBeta } from "@/lib/beta/config";
import type { BetaUsage } from "@/lib/beta/quota";

// Slim persistent banner for guests. Open beta: shows the free limits and how
// many AI replies are left today (refreshed on every navigation).
export function GuestBanner() {
  const beta = isOpenBeta();
  const pathname = usePathname();
  const [usage, setUsage] = useState<BetaUsage | null>(null);

  useEffect(() => {
    if (!beta) return;
    let cancelled = false;
    const load = () =>
      fetch("/api/beta/usage", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => !cancelled && setUsage(data?.usage ?? null))
        .catch(() => undefined);
    load();
    window.addEventListener(BETA_USAGE_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(BETA_USAGE_EVENT, load);
    };
  }, [beta, pathname]);

  if (!beta) {
    return (
      <div
        className="flex items-center justify-center gap-2 border-b border-border bg-secondary/60 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur"
        data-testid="workspace-guest-banner"
      >
        <span>Guest mode — your chats may be lost.</span>
        <Link
          href="/signup"
          className="font-medium text-primary underline-offset-4 hover:underline"
          data-testid="workspace-guest-banner-save"
        >
          Save your account
        </Link>
      </div>
    );
  }

  const aiLeft = Math.max(0, BETA_LIMITS.aiCallsPerUserPerDay - (usage?.aiUsedToday ?? 0));
  const chatsLeft = Math.max(0, BETA_LIMITS.chats - (usage?.chatsStarted ?? 0));
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 border-b border-border bg-secondary/60 px-4 py-1.5 text-[11px] text-muted-foreground backdrop-blur"
      data-testid="workspace-beta-banner"
    >
      <span className="font-medium text-foreground">🧪 Open beta</span>
      <span data-testid="workspace-beta-ai-left">
        <span className={aiLeft <= 3 ? "font-semibold text-warning" : "font-semibold text-foreground"}>{aiLeft}</span>/
        {BETA_LIMITS.aiCallsPerUserPerDay} AI replies left today
      </span>
      <span className="hidden sm:inline" aria-hidden>·</span>
      <span data-testid="workspace-beta-chats-left">
        <span className="font-semibold text-foreground">{chatsLeft}</span>/{BETA_LIMITS.chats} new chats left
      </span>
    </div>
  );
}
