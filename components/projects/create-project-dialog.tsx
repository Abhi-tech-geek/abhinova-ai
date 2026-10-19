"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PROJECT_ACCENT } from "@/components/projects/project-card";
import { PROJECT_COLORS, type ProjectColor, type ProjectRecord } from "@/types/projects";
import { showBetaLimitToast } from "@/lib/beta/client";

const ICONS = ["📁", "🧪", "📚", "🚀", "🐞", "🧠", "📊", "🛠️", "🎯", "💼", "🌐", "📝"];

export interface ProjectDraft {
  name: string;
  description: string;
  custom_instructions: string;
  icon: string;
  color: ProjectColor;
}

const EMPTY: ProjectDraft = { name: "", description: "", custom_instructions: "", icon: "📁", color: "violet" };

// Create (POST /api/projects) or edit (PATCH /api/projects/[id]) a project.
export function CreateProjectDialog({
  open,
  onOpenChange,
  project,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit mode. */
  project?: ProjectRecord;
  /** Prefill for templates. */
  initial?: Partial<ProjectDraft>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ProjectDraft>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(
      project
        ? {
            name: project.name,
            description: project.description ?? "",
            custom_instructions: project.custom_instructions ?? "",
            icon: project.icon,
            color: project.color,
          }
        : { ...EMPTY, ...initial }
    );
  }, [open, project, initial]);

  async function save() {
    if (!draft.name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(project ? `/api/projects/${project.id}` : "/api/projects", {
        method: project ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim() || (project ? null : undefined),
          custom_instructions: draft.custom_instructions.trim() || (project ? null : undefined),
          icon: draft.icon,
          color: draft.color,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (await showBetaLimitToast(res)) return;
        toast.error(
          data.error === "guest_limit_reached"
            ? "Guests can create 1 project — create a free account for more."
            : "Couldn't save the project."
        );
        return;
      }
      onOpenChange(false);
      if (project) {
        toast.success("Project updated");
        router.refresh();
      } else {
        toast.success("Project created");
        router.push(`/projects/${data.project.id}`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            A project is a small custom AI: its own knowledge, notes and instructions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl ${PROJECT_ACCENT[draft.color].tile}`}>
              {draft.icon}
            </span>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 80) })}
                placeholder="Client App Testing"
                data-testid="projects-dialog-name"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-1.5">
              {ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setDraft({ ...draft, icon })}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-colors ${
                    draft.icon === icon ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-secondary"
                  }`}
                  data-testid={`projects-dialog-icon-${icon}`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Colour</Label>
            <div className="flex gap-2">
              {PROJECT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setDraft({ ...draft, color })}
                  title={color}
                  className={`h-7 w-7 rounded-full ${PROJECT_ACCENT[color].dot} transition-transform ${
                    draft.color === color ? "scale-110 ring-2 ring-foreground/60 ring-offset-2 ring-offset-background" : "opacity-70 hover:opacity-100"
                  }`}
                  data-testid={`projects-dialog-color-${color}`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="project-description">Description (optional)</Label>
            <Input
              id="project-description"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value.slice(0, 500) })}
              placeholder="What is this project about?"
              data-testid="projects-dialog-description"
            />
          </div>

          {!project && (
            <div className="space-y-1.5">
              <Label htmlFor="project-instructions">Custom instructions (optional)</Label>
              <Textarea
                id="project-instructions"
                value={draft.custom_instructions}
                onChange={(e) => setDraft({ ...draft, custom_instructions: e.target.value.slice(0, 4000) })}
                placeholder="Tu is app ka QA expert hai, hamesha test cases table format mein de."
                rows={3}
                data-testid="projects-dialog-instructions"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="projects-dialog-cancel">
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={!draft.name.trim() || saving}
            className="brand-gradient text-white"
            data-testid="projects-dialog-save"
          >
            {saving ? "Saving…" : project ? "Save changes" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
