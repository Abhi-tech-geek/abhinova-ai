"use client";

import type { DocumentRecord } from "@/types/documents";

// Multi-select picker for ready documents (used by the ask-your-documents panel).
export function DocumentPicker({
  documents,
  selectedIds,
  onChange,
}: {
  documents: DocumentRecord[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((s) => s !== id)
        : [...selectedIds, id]
    );
  }

  if (documents.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No ready documents yet — upload and process one first.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2" data-testid="documents-picker">
      {documents.map((doc) => {
        const selected = selectedIds.includes(doc.id);
        return (
          <button
            key={doc.id}
            type="button"
            onClick={() => toggle(doc.id)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              selected
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
            data-testid="documents-picker-item"
          >
            {selected ? "✓ " : ""}
            {doc.file_name}
          </button>
        );
      })}
    </div>
  );
}
