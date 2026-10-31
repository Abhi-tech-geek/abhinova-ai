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
import type { ChatSearchResult } from "@/types/chat";

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
  const [query, setQuery] = useState("");
  const [chats, setChats] = useState<ChatSearchResult[]>([]);

  // Chat search (titles + message text), debounced, from 2 characters.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/conversations/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((data: { results?: ChatSearchResult[] }) => setChats(data.results ?? []))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  const visibleChats = query.trim().length >= 2 ? chats : [];

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
        placeholder="Search your chats, or type a command…"
        value={query}
        onValueChange={setQuery}
        data-testid="shared-commandpalette-input"
      />
      <CommandList data-testid="shared-commandpalette-list">
        <CommandEmpty>No results found.</CommandEmpty>
        {visibleChats.length > 0 && (
          <>
            <CommandGroup heading="Chats">
              {visibleChats.map((c) => (
                <CommandItem
                  key={c.id}
                  // Includes the query so cmdk's own filter keeps server matches visible.
                  value={`chat ${c.id} ${query} ${c.title}`}
                  onSelect={() =>
                    run(() => router.push(c.projectId ? `/projects/${c.projectId}/chat/${c.id}` : `/chat/${c.id}`))
                  }
                  data-testid="shared-commandpalette-chat"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">💬 {c.title}</span>
                    {c.snippet && <span className="truncate text-xs opacity-70">{c.snippet}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
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
