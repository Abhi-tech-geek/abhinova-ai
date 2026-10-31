"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { isOpenBeta } from "@/lib/beta/config";
import { openWelcomeTour } from "@/components/shared/welcome-tour";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Sidebar footer account menu (Claude/ChatGPT style). Also hosts the single
// workspace → Wellness Mode integration point (see CLAUDE.md Wellness rules).
export function UserMenu({
  userEmail,
  displayName,
  isGuestUser,
  wellnessEnabled,
  collapsed,
  onNavigate,
}: {
  userEmail: string | null;
  displayName: string | null;
  isGuestUser: boolean;
  wellnessEnabled: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  // Open beta: no accounts — no "save account", and no sign-out (signing out
  // would just mint a fresh guest with a fresh quota).
  const beta = isOpenBeta();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const name = isGuestUser ? (beta ? "Beta tester" : "Guest") : (displayName ?? userEmail ?? "Account");
  // `||` not `??`: anonymous users have an empty-string email.
  const initials = (displayName || userEmail || name)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  function go(href: string) {
    router.push(href);
    onNavigate?.();
  }

  async function toggleWellness(enabled: boolean) {
    if (isGuestUser && !beta) {
      toast.info("Wellness Mode needs an account", {
        description:
          "Your check-ins and journals are personal — create a free account to keep them safe.",
        action: { label: "Sign up", onClick: () => router.push("/signup") },
      });
      return;
    }
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }
    await supabase.from("profiles").update({ wellness_enabled: enabled }).eq("id", user.id);
    setTheme(enabled ? "wellness" : "dark");
    if (enabled) go("/talk");
    router.refresh();
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={collapsed ? name : undefined}
          className={`flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors hover:bg-secondary/60 data-[state=open]:bg-secondary/60 ${
            collapsed ? "justify-center" : ""
          }`}
          data-testid="sidebar-user-menu"
        >
          <span className="brand-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
            {initials}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {isGuestUser ? (beta ? "Open beta tester" : "Guest session") : displayName ? userEmail : "Workspace"}
                </span>
              </span>
              <span className="text-xs text-muted-foreground" aria-hidden>⌃</span>
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {userEmail || (beta ? "🧪 Open beta tester" : "Guest session")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isGuestUser && !beta && (
          <DropdownMenuItem onSelect={() => go("/signup")} className="text-primary" data-testid="sidebar-user-upgrade">
            ✨ Save your account
          </DropdownMenuItem>
        )}
        {!(beta && isGuestUser) && (
          <DropdownMenuItem onSelect={() => go("/settings")} data-testid="sidebar-nav-settings">
            ⚙️ Settings
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => { onNavigate?.(); openWelcomeTour(); }} data-testid="sidebar-product-tour">
          ✨ Product tour
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go("/privacy#delete")} data-testid="sidebar-delete-data">
          🗑 Delete my data
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-testid="sidebar-theme-menu">🎨 Theme</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={mounted ? theme : undefined} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="dark" data-testid="sidebar-theme-dark">🌙 Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="light" data-testid="sidebar-theme-light">☀️ Light</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem
          onSelect={() => toggleWellness(!wellnessEnabled)}
          role="menuitemcheckbox"
          aria-checked={wellnessEnabled}
          data-testid="sidebar-wellness-toggle"
        >
          🌿 Wellness mode
          <span
            className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
              wellnessEnabled ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"
            }`}
          >
            {wellnessEnabled ? "On" : "Off"}
          </span>
        </DropdownMenuItem>
        {!beta && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut} data-testid="sidebar-signout-action">
              ↪ Sign out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
