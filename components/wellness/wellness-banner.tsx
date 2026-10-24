"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/talk", label: "Talk" },
  { href: "/mood", label: "Mood" },
  { href: "/journal", label: "Journal" },
  { href: "/progress", label: "Progress" },
];

// Top bar of the wellness shell: nav + standing disclaimer + exit back to work.
export function WellnessBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme } = useTheme();

  async function exitWellness() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ wellness_enabled: false })
        .eq("id", user.id);
    }
    setTheme("dark");
    router.push("/chat");
    router.refresh();
  }

  return (
    <header
      className="glass sticky top-0 z-40 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border/60 px-4 py-2.5 sm:px-5 lg:flex-nowrap"
      data-testid="wellness-banner"
    >
      {/* Mobile: row 1 = brand + exit, row 2 = full-width nav. sm+: one row. */}
      <div className="contents sm:flex sm:min-w-0 sm:items-center sm:gap-4">
        <span className="flex shrink-0 items-center gap-2">
          <span className="brand-gradient flex h-7 w-7 items-center justify-center rounded-full text-xs text-white">
            ✦
          </span>
          <span className="font-display text-sm font-semibold tracking-tight">
            Wellness
          </span>
          <span className="hidden rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground sm:inline">
            calm
          </span>
        </span>
        <nav className="order-last -mx-1 flex w-full gap-1 overflow-x-auto px-1 sm:order-none sm:mx-0 sm:w-auto sm:px-0">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-full px-3 py-1 text-xs transition-colors ${
                pathname === item.href
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`wellness-nav-${item.label.toLowerCase()}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <p className="hidden text-[10px] text-muted-foreground lg:block">
          AbhiNova is not a replacement for a professional therapist.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={exitWellness}
          data-testid="wellness-exit-action"
        >
          ← Back to work
        </Button>
      </div>
      {/* Phones/tablets: the standing disclaimer gets its own line under the nav. */}
      <p
        className="order-last w-full text-center text-[10px] text-muted-foreground lg:hidden"
        data-testid="wellness-banner-disclaimer"
      >
        AbhiNova is not a replacement for a professional therapist.
      </p>
    </header>
  );
}
