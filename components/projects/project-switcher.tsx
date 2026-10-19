"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProjectWithStats } from "@/types/projects";

// Quick jump between projects from inside a project chat.
export function ProjectSwitcher({ currentId, currentName, currentIcon }: { currentId: string; currentName: string; currentIcon: string }) {
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : { projects: [] }))
      .then((data) => setProjects((data.projects ?? []).filter((p: ProjectWithStats) => !p.is_archived)))
      .catch(() => setProjects([]));
  }, []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold transition-colors hover:bg-secondary/60"
          data-testid="projects-switcher-trigger"
        >
          <span>{currentIcon}</span>
          <span className="max-w-48 truncate">{currentName}</span>
          <span className="text-xs text-muted-foreground">▾</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="glass w-60">
        <DropdownMenuLabel className="text-xs">Switch project</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.map((p) => (
          <DropdownMenuItem key={p.id} asChild>
            <Link href={`/projects/${p.id}`} data-testid="projects-switcher-item" className={p.id === currentId ? "font-semibold" : ""}>
              <span className="mr-2">{p.icon}</span>
              <span className="truncate">{p.name}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/projects" data-testid="projects-switcher-all">
            All projects
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
