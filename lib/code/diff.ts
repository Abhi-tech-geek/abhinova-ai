"use client";

// Diff generation + applying REVIEWED changes. The AI never writes to disk —
// the user approves each change in the DiffViewer, and only then this module
// writes through the File System Access handle (CLAUDE.md Code Studio rules).

import { diffLines, type Change } from "diff";
import { writeFileText } from "@/lib/code/fs-access";

export interface DiffLine {
  kind: "added" | "removed" | "unchanged";
  text: string;
}

/** Line-level diff for the DiffViewer. */
export function computeDiff(oldContent: string, newContent: string): DiffLine[] {
  const parts: Change[] = diffLines(oldContent, newContent);
  const lines: DiffLine[] = [];
  for (const part of parts) {
    const kind: DiffLine["kind"] = part.added
      ? "added"
      : part.removed
        ? "removed"
        : "unchanged";
    for (const text of part.value.replace(/\n$/, "").split("\n")) {
      lines.push({ kind, text });
    }
  }
  return lines;
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((l) => l.kind === "added").length,
    removed: lines.filter((l) => l.kind === "removed").length,
  };
}

/** Applies ONE user-approved change to the picked directory. */
export async function applyApprovedChange(
  root: FileSystemDirectoryHandle,
  path: string,
  newContent: string
): Promise<void> {
  await writeFileText(root, path, newContent);
}
