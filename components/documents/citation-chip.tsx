"use client";

import { describeChunkLocation } from "@/lib/utils";
import type { RetrievedSource } from "@/types/documents";

const SOURCE_ICON: Record<string, string> = {
  jira: "🎫",
  github: "🐙",
  notion: "📓",
  gdrive: "🗂️",
  url: "🔗",
};

/** "Budget.xlsx — Sheet: Q1, rows 12–40" / "PROJ-123 — Login fails" / "spec.pdf — p.3". */
export function citationLabel(source: RetrievedSource): string {
  const where = describeChunkLocation(source.metadata);
  // Issue-keyed titles already start with the key — don't repeat it.
  if (where && !source.fileName.startsWith(where)) return `${source.fileName} — ${where}`;
  return source.fileName;
}

function iconFor(source: RetrievedSource): string {
  if (source.metadata.issueKey?.startsWith("#")) return SOURCE_ICON.github;
  if (source.metadata.issueKey) return SOURCE_ICON.jira;
  if (source.sourceUrl) return SOURCE_ICON.url;
  return "📄";
}

// Small inline chip for an [S1]-style citation; clicking opens the chunk viewer.
export function CitationChip({
  source,
  onClick,
}: {
  source: RetrievedSource;
  onClick: (source: RetrievedSource) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(source)}
      title={citationLabel(source)}
      className="mx-0.5 inline-flex max-w-56 items-center gap-1 truncate rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 align-baseline text-[10px] text-accent transition-colors hover:bg-accent/20"
      data-testid="documents-citation-chip"
    >
      {iconFor(source)} {citationLabel(source)}
    </button>
  );
}
