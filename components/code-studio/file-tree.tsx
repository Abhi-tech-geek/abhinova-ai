"use client";

import type { ProjectFileEntry, SkippedFile } from "@/types/code";

// Flat, indented tree of the connected project. Skipped files shown collapsed
// at the bottom with the reason (transparency requirement in CLAUDE.md).
export function FileTree({
  files,
  skipped,
  openPath,
  onOpen,
}: {
  files: ProjectFileEntry[];
  skipped: SkippedFile[];
  openPath: string | null;
  onOpen: (entry: ProjectFileEntry) => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto p-2" data-testid="codestudio-filetree">
      <ul className="space-y-0.5">
        {files.map((file) => {
          const depth = file.path.split("/").length - 1;
          const name = file.path.split("/").pop();
          return (
            <li key={file.path}>
              <button
                type="button"
                onClick={() => onOpen(file)}
                style={{ paddingLeft: `${8 + depth * 12}px` }}
                className={`w-full truncate rounded px-2 py-1 text-left font-mono text-[11px] transition-colors ${
                  openPath === file.path
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
                title={file.path}
                data-testid="codestudio-filetree-item"
              >
                {name}
              </button>
            </li>
          );
        })}
      </ul>
      {skipped.length > 0 && (
        <details className="mt-3 border-t border-border/50 pt-2">
          <summary className="cursor-pointer text-[10px] text-muted-foreground" data-testid="codestudio-skipped-toggle">
            🛡 {skipped.length} file(s) protected / skipped
          </summary>
          <ul className="mt-1 space-y-0.5">
            {skipped.map((s) => (
              <li key={s.path} className="truncate px-2 text-[10px] text-muted-foreground/70" title={`${s.path} — ${s.reason}`}>
                {s.path} <span className="opacity-60">({s.reason})</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
