"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import type { ProjectWithStats } from "@/types/projects";

export const OPEN_PALETTE_EVENT = "anv:open-command-palette";

/** Open the Cmd+K palette from anywhere (e.g. a button). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

// Cmd/Ctrl+K launcher: navigate anywhere, jump to a project, switch theme,
// toggle Wellness Mode.
export function CommandPalette() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);

  // Projects load lazily the first time the palette opens.
  useEffect(() => {
    if (!open || projects.length > 0) return;
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : { projects: [] }))
      .then((data) => setProjects((data.projects ?? []).filter((p: ProjectWithStats) => !p.is_archived)))
      .catch(() => setProjects([]));
  }, [open, projects.length]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    // The sidebar's "Search" item opens the palette without a keyboard.
    const onOpenRequest = () => setOpen(true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpenRequest);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpenRequest);
    };
  }, []);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Type a command or search…"
        data-testid="shared-commandpalette-input"
      />
      <CommandList data-testid="shared-commandpalette-list">
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => run(() => router.push("/chat"))}>
            💬 Chat
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/projects"))}>
            📁 Projects
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/qa-studio"))}>
            🧪 QA Studio
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/documents"))}>
            📄 Documents
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/settings"))}>
            ⚙️ Settings
          </CommandItem>
        </CommandGroup>
        {projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Jump to project…">
              {projects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`project ${p.name}`}
                  onSelect={() => run(() => router.push(`/projects/${p.id}`))}
                  data-testid="shared-commandpalette-project"
                >
                  {p.icon} {p.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        <CommandSeparator />
        <CommandGroup heading="Theme">
          <CommandItem onSelect={() => run(() => setTheme("dark"))}>
            🌑 Dark theme
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme("light"))}>
            ☀️ Light theme
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme("wellness"))}>
            🌿 Wellness theme
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Modes">
          <CommandItem onSelect={() => run(() => router.push("/talk"))}>
            🧘 Open Wellness Mode
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
