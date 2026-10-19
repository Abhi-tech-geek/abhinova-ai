"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { PROJECT_ACCENT } from "@/components/projects/project-card";
import type { ProjectRecord } from "@/types/projects";

export function ProjectHeader({ project, documentCount }: { project: ProjectRecord; documentCount: number }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteDocs, setDeleteDocs] = useState(false);
  const [busy, setBusy] = useState(false);
  const accent = PROJECT_ACCENT[project.color] ?? PROJECT_ACCENT.violet;

  async function toggleArchive() {
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_archived: !project.is_archived }),
    });
    if (!res.ok) {
      toast.error("Couldn't update the project.");
      return;
    }
    toast.success(project.is_archived ? "Project restored" : "Project archived");
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/projects/${project.id}?deleteDocuments=${deleteDocs}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      toast.error("Couldn't delete the project.");
      return;
    }
    toast.success("Project deleted");
    router.push("/projects");
    router.refresh();
  }

  return (
    <header className="flex flex-wrap items-start gap-4">
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl ${accent.tile}`}>
        {project.icon}
      </span>
      {/* min width forces the action buttons onto their own row on phones
          instead of squeezing the title into a one-word-per-line column. */}
      <div className="min-w-[12rem] flex-1">
        <Link href="/projects" className="text-xs text-muted-foreground hover:text-foreground" data-testid="projects-header-back">
          ← All projects
        </Link>
        <h1 className="mt-0.5 font-display text-2xl font-semibold tracking-tight">
          {project.name}
          {project.is_archived && <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">(archived)</span>}
        </h1>
        {project.description && <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} data-testid="projects-header-edit">
          Edit
        </Button>
        <Button size="sm" variant="outline" onClick={toggleArchive} data-testid="projects-header-archive">
          {project.is_archived ? "Restore" : "Archive"}
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteOpen(true)} data-testid="projects-header-delete">
          Delete
        </Button>
      </div>

      <CreateProjectDialog open={editOpen} onOpenChange={setEditOpen} project={project} />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="glass max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{project.name}”?</DialogTitle>
            <DialogDescription>
              This permanently removes the project, its instructions, notes and linked sources (with everything
              synced from them). Chats move back to your main chat list.
            </DialogDescription>
          </DialogHeader>
          {documentCount > 0 && (
            <label className="flex items-start gap-2 rounded-lg border border-border/60 p-3 text-xs">
              <input
                type="checkbox"
                checked={deleteDocs}
                onChange={(e) => setDeleteDocs(e.target.checked)}
                className="mt-0.5"
                data-testid="projects-delete-docs-checkbox"
              />
              <span>
                Also delete its {documentCount} uploaded file(s), their search index and stored copies. Leave unticked to
                keep them in Documents.
              </span>
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} data-testid="projects-delete-cancel">
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={busy} data-testid="projects-delete-confirm">
              {busy ? "Deleting…" : "Delete project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
