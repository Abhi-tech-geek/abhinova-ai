"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const EXAMPLES = [
  "Tu is app ka QA expert hai, hamesha test cases table format mein de.",
  "Answer in short bullet points and always mention which document you used.",
  "You are our API reviewer: flag breaking changes and missing validation first.",
];

// Custom instructions shape tone/role/format for every chat in the project.
// They're layered BELOW the system safety rules — they can't override them.
export function ProjectInstructions({
  projectId,
  initial,
}: {
  projectId: string;
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = value.trim() !== saved.trim();

  async function save() {
    if (!dirty || saving) return;
    const previous = saved;
    setSaved(value); // optimistic
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_instructions: value.trim() || null }),
      });
      if (!res.ok) throw new Error();
      toast.success("Instructions saved");
    } catch {
      setSaved(previous);
      toast.error("Couldn't save instructions — your text is still here.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="glass rounded-2xl p-5" data-testid="projects-instructions-panel">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">🧭 Instructions</h2>
        <span className="text-[10px] text-muted-foreground">{value.length}/4000</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">How the AI should behave in this project — role, tone, output format.</p>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, 4000))}
        rows={5}
        placeholder="e.g. Tu is app ka QA expert hai…"
        className="mt-3 text-sm"
        data-testid="projects-instructions-input"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex, i) => (
          <button
            key={ex}
            type="button"
            onClick={() => setValue(ex)}
            className="rounded-full border border-border/60 px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            data-testid={`projects-instructions-example-${i}`}
          >
            {ex.length > 48 ? `${ex.slice(0, 48)}…` : ex}
          </button>
        ))}
      </div>
      <Button size="sm" className="mt-3" onClick={save} disabled={!dirty || saving} data-testid="projects-instructions-save">
        {saving ? "Saving…" : dirty ? "Save instructions" : "Saved ✓"}
      </Button>
    </section>
  );
}
