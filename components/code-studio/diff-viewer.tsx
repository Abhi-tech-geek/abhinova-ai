"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { computeDiff, diffStats, applyApprovedChange } from "@/lib/code/diff";
import type { CodeEditOutput } from "@/types/code";

interface PendingChange {
  path: string;
  oldContent: string;
  newContent: string;
  note: string;
  status: "pending" | "applied" | "rejected";
}

// Review UI for AI-proposed edits. NOTHING is written until the user approves
// each change (or explicitly confirms "Apply all").
export function DiffViewer({
  edit,
  oldContents,
  root,
  onApplied,
  onClose,
}: {
  edit: CodeEditOutput;
  oldContents: Record<string, string>;
  root: FileSystemDirectoryHandle | null;
  onApplied: (path: string, newContent: string) => void;
  onClose: () => void;
}) {
  const [changes, setChanges] = useState<PendingChange[]>(
    edit.changes.map((c) => ({
      path: c.path,
      oldContent: oldContents[c.path] ?? "",
      newContent: c.newContent,
      note: c.note,
      status: "pending",
    }))
  );

  async function apply(change: PendingChange) {
    if (!root) {
      toast.error("No local folder connected — cannot write.");
      return;
    }
    try {
      await applyApprovedChange(root, change.path, change.newContent);
      setChanges((prev) =>
        prev.map((c) => (c.path === change.path ? { ...c, status: "applied" } : c))
      );
      onApplied(change.path, change.newContent);
      toast.success(`Saved ${change.path}`);
    } catch {
      toast.error(`Could not write ${change.path}`);
    }
  }

  function reject(change: PendingChange) {
    setChanges((prev) =>
      prev.map((c) => (c.path === change.path ? { ...c, status: "rejected" } : c))
    );
  }

  async function applyAll() {
    // Explicit confirm required for bulk writes (CLAUDE.md).
    if (!window.confirm(`Apply ALL ${changes.filter((c) => c.status === "pending").length} pending change(s) to your local folder?`)) {
      return;
    }
    for (const change of changes) {
      if (change.status === "pending") await apply(change);
    }
  }

  const pending = changes.filter((c) => c.status === "pending").length;

  return (
    <div className="glass flex h-full flex-col rounded-lg" data-testid="codestudio-diffviewer">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
        <div>
          <p className="text-xs font-medium">Proposed changes — review before anything is written</p>
          <p className="text-[10px] text-muted-foreground">{edit.summary}</p>
        </div>
        <div className="flex gap-2">
          {pending > 1 && (
            <Button size="sm" variant="outline" onClick={applyAll} data-testid="codestudio-diff-applyall">
              Apply all ({pending})
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose} data-testid="codestudio-diff-close">
            ✕
          </Button>
        </div>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {changes.map((change) => {
          const lines = computeDiff(change.oldContent, change.newContent);
          const stats = diffStats(lines);
          return (
            <div key={change.path} className="rounded-md border border-border/50" data-testid="codestudio-diff-file">
              <div className="flex items-center justify-between border-b border-border/50 px-3 py-1.5">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11px]">{change.path}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {change.note} · <span className="text-success">+{stats.added}</span>{" "}
                    <span className="text-destructive">−{stats.removed}</span>
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {change.status === "pending" ? (
                    <>
                      <Button size="sm" onClick={() => apply(change)} data-testid="codestudio-diff-approve">
                        ✓ Approve &amp; write
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => reject(change)} data-testid="codestudio-diff-reject">
                        Reject
                      </Button>
                    </>
                  ) : (
                    <span className={`text-[10px] ${change.status === "applied" ? "text-success" : "text-muted-foreground"}`}>
                      {change.status === "applied" ? "✓ written" : "rejected"}
                    </span>
                  )}
                </div>
              </div>
              <pre className="max-h-64 overflow-auto p-2 font-mono text-[11px] leading-relaxed">
                {lines.map((line, i) => (
                  <div
                    key={i}
                    className={
                      line.kind === "added"
                        ? "bg-success/10 text-success"
                        : line.kind === "removed"
                          ? "bg-destructive/10 text-destructive line-through/25"
                          : "text-muted-foreground"
                    }
                  >
                    {line.kind === "added" ? "+ " : line.kind === "removed" ? "− " : "  "}
                    {line.text}
                  </div>
                ))}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
