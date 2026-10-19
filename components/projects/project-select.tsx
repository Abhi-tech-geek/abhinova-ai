"use client";

import { useEffect, useState } from "react";
import type { ProjectWithStats } from "@/types/projects";

// Optional "use a project's knowledge" selector for QA Studio / Code Studio.
// Empty value = no project.
export function ProjectSelect({
  value,
  onChange,
  testID,
  label = "Project knowledge",
}: {
  value: string;
  onChange: (projectId: string) => void;
  testID: string;
  label?: string;
}) {
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : { projects: [] }))
      .then((data) => setProjects((data.projects ?? []).filter((p: ProjectWithStats) => !p.is_archived)))
      .catch(() => setProjects([]));
  }, []);

  if (projects.length === 0) return null;

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>📁 {label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 max-w-56 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        data-testid={testID}
      >
        <option value="">None</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.icon} {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
