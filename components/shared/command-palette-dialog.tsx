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

// The palette's body (cmdk + dialog). Loaded on first open by CommandPalette,
// so pages don't ship it up front.
export default function CommandPaletteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);

  // Projects load lazily the first time the palette opens.
  useEffect(() => {
    if (!open || projects.length > 0) return;
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : { projects: [] }))
      .then((data) => setProjects((data.projects ?? []).filter((p: ProjectWithStats) => !p.is_archived)))
      .catch(() => setProjects([]));
  }, [open, projects.length]);

  function run(action: () => void) {
    onOpenChange(false);
    action();
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
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
