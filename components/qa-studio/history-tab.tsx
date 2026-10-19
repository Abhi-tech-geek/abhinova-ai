"use client";

import { useState } from "react";
import { OutputPanel } from "@/components/qa-studio/output-panel";
import type { QaToolId, QaArtifactRecord } from "@/types/qa";
import { LocalTime } from "@/components/shared/local-time";

export function HistoryTab({
  toolId,
  artifacts,
}: {
  toolId: QaToolId;
  artifacts: QaArtifactRecord[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (artifacts.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground" data-testid="qastudio-history-empty">
        No history yet — your generations for this tool will appear here.
      </p>
    );
  }

  const selected = artifacts.find((a) => a.id === selectedId) ?? null;
  const selectedOutput = selected ? safeParse(selected.output) : null;

  return (
    <div className="space-y-4">
      <ul className="space-y-1.5">
        {artifacts.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => setSelectedId(a.id === selectedId ? null : a.id)}
              className={`w-full rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                a.id === selectedId
                  ? "border-primary/50 bg-secondary"
                  : "border-border/50 hover:bg-secondary/50"
              }`}
              data-testid="qastudio-history-item"
            >
              <span className="line-clamp-1 text-foreground">{a.input}</span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                <LocalTime iso={a.created_at} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {selected && selectedOutput !== null && (
        <OutputPanel toolId={toolId} data={selectedOutput} />
      )}
      {selected && selectedOutput === null && (
        <p className="text-xs text-destructive">This history entry could not be parsed.</p>
      )}
    </div>
  );
}

function safeParse(json: string): unknown | null {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
