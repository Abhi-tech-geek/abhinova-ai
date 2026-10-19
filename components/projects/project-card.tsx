import Link from "next/link";
import type { ProjectColor, ProjectWithStats } from "@/types/projects";
import { LocalTime } from "@/components/shared/local-time";

// Project accents map onto design tokens (never hardcoded hex) so every
// theme — dark, light, wellness — recolours them automatically.
export const PROJECT_ACCENT: Record<ProjectColor, { tile: string; ring: string; dot: string }> = {
  violet: { tile: "bg-primary/15 text-primary", ring: "hover:border-primary/50", dot: "bg-primary" },
  blue: { tile: "bg-chart-1/15 text-chart-1", ring: "hover:border-chart-1/50", dot: "bg-chart-1" },
  teal: { tile: "bg-success/15 text-success", ring: "hover:border-success/50", dot: "bg-success" },
  amber: { tile: "bg-warning/15 text-warning", ring: "hover:border-warning/50", dot: "bg-warning" },
  rose: { tile: "bg-chart-5/15 text-chart-5", ring: "hover:border-chart-5/50", dot: "bg-chart-5" },
  slate: { tile: "bg-muted text-muted-foreground", ring: "hover:border-border", dot: "bg-muted-foreground" },
};

export function ProjectCard({ project }: { project: ProjectWithStats }) {
  const accent = PROJECT_ACCENT[project.color] ?? PROJECT_ACCENT.violet;
  return (
    <Link
      href={`/projects/${project.id}`}
      className={`glass hover-lift group flex flex-col rounded-2xl p-5 transition-shadow hover:shadow-glow-primary ${accent.ring} ${project.is_archived ? "opacity-60" : ""}`}
      data-testid="projects-card-open"
    >
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${accent.tile}`}>
          {project.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[15px] font-semibold tracking-tight">
            {project.name}
          </h3>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {project.description || "No description yet."}
          </p>
        </div>
        {project.is_archived && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">archived</span>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>📄 {project.documentCount} docs</span>
        <span>💬 {project.chatCount} chats</span>
        <span className="ml-auto"><LocalTime iso={project.lastActivity} format="relative" /></span>
      </div>
    </Link>
  );
}
