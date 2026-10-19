import { createClient } from "@/lib/supabase/server";
import { listProjectsWithStats } from "@/lib/projects/scope";
import { ProjectGrid } from "@/components/projects/project-grid";

export const metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const projects = await listProjectsWithStats(createClient());
  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          <span className="text-gradient">Projects</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Scoped workspaces — each one is a small custom AI that answers only from its own knowledge.
        </p>
      </header>
      <ProjectGrid projects={projects} />
    </main>
  );
}
