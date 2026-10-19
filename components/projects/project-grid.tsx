"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ProjectCard } from "@/components/projects/project-card";
import { CreateProjectDialog, type ProjectDraft } from "@/components/projects/create-project-dialog";
import type { ProjectWithStats } from "@/types/projects";

// One-click starter templates shown in the empty state.
const TEMPLATES: (Partial<ProjectDraft> & { name: string; blurb: string })[] = [
  {
    name: "Client App Testing",
    icon: "🧪",
    color: "violet",
    blurb: "Specs, Jira tickets and regression checklists in one place.",
    description: "QA knowledge base for the client app.",
    custom_instructions:
      "Tu is app ka QA expert hai. Test cases hamesha table format mein de (ID, title, steps, expected, priority, type), aur har jawab mein relevant ticket ya document cite kar.",
  },
  {
    name: "Research Papers",
    icon: "📚",
    color: "blue",
    blurb: "Ask across papers and get answers with page-level citations.",
    description: "Papers and notes for my research.",
    custom_instructions: "Answer like a careful research assistant. Compare sources when they disagree and always cite the page.",
  },
  {
    name: "Product Docs",
    icon: "🚀",
    color: "teal",
    blurb: "PRDs, TRDs and API specs your whole team can query.",
    description: "Product requirements and technical docs.",
    custom_instructions: "Be concise and precise. When asked about a feature, quote the requirement and point out open questions.",
  },
];

type Sort = "recent" | "name";

export function ProjectGrid({ projects }: { projects: ProjectWithStats[] }) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<Sort>("recent");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [template, setTemplate] = useState<Partial<ProjectDraft> | undefined>();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter((p) => (showArchived ? true : !p.is_archived))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q))
      .sort((a, b) =>
        sort === "name" ? a.name.localeCompare(b.name) : b.lastActivity.localeCompare(a.lastActivity)
      );
  }, [projects, query, showArchived, sort]);

  function openNew(draft?: Partial<ProjectDraft>) {
    setTemplate(draft);
    setDialogOpen(true);
  }

  // Sidebar "New project" links to /projects?new=1 — open the dialog, then
  // drop the param so a refresh doesn't reopen it.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setTemplate(undefined);
    setDialogOpen(true);
    router.replace(pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects…"
          className="h-9 max-w-xs"
          data-testid="projects-search-input"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          data-testid="projects-sort-select"
        >
          <option value="recent">Most recent</option>
          <option value="name">Name A–Z</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} data-testid="projects-archived-toggle" />
          Show archived
        </label>
        <span className="flex-1" />
        <Button onClick={() => openNew()} className="brand-gradient rounded-full text-white shadow-glow-primary" data-testid="projects-new-action">
          + New project
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="mt-10 flex flex-col items-center text-center" data-testid="projects-empty-state">
          <div className="relative mb-6 h-28 w-28">
            <span className="brand-gradient absolute inset-0 rounded-full opacity-30 blur-2xl" style={{ animation: "anv-breathe 5s ease-in-out infinite" }} />
            <span className="glass absolute inset-4 grid place-items-center rounded-3xl text-4xl">📁</span>
          </div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Build your first mini-AI</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            A project gets its own knowledge base, notes and instructions — every chat inside it answers from that.
            Start from a template:
          </p>
          <div className="mt-6 grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
            {TEMPLATES.map((t, i) => (
              <button
                key={t.name}
                type="button"
                onClick={() => openNew(t)}
                style={{ animationDelay: `${100 + i * 70}ms` }}
                className="glass hover-lift rounded-2xl p-4 text-left fill-mode-both animate-in fade-in slide-in-from-bottom-2 hover:border-primary/40 motion-reduce:animate-none"
                data-testid={`projects-template-${i}`}
              >
                <span className="text-2xl">{t.icon}</span>
                <p className="mt-2 text-sm font-semibold">{t.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.blurb}</p>
              </button>
            ))}
          </div>
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground" data-testid="projects-no-matches">
          No projects match.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="projects-grid">
          {visible.map((p, i) => (
            <div
              key={p.id}
              style={{ animationDelay: `${i * 30}ms` }}
              className="fill-mode-both animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none"
            >
              <ProjectCard project={p} />
            </div>
          ))}
        </div>
      )}

      <CreateProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={template} />
    </>
  );
}
