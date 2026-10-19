"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { downloadFile } from "@/lib/qa-tools";
import { DOC_TYPES } from "@/lib/validators/code";
import { ProjectSelect } from "@/components/projects/project-select";
import type { CodeFile } from "@/types/code";
import { showBetaLimitToast } from "@/lib/beta/client";

const DOC_LABELS: Record<string, string> = {
  prd: "PRD",
  trd: "TRD",
  architecture: "Architecture",
  "api-spec": "API Spec",
};

// PRD / TRD / architecture / API-spec generator. Markdown out, downloadable;
// writing into the project reuses the diff-review flow via onProposeWrite.
export function DocGenPanel({
  contextFiles,
  modelId,
  onProposeWrite,
}: {
  contextFiles: CodeFile[];
  modelId: string;
  onProposeWrite: (path: string, content: string) => void;
}) {
  const [docType, setDocType] = useState<string>("prd");
  const [description, setDescription] = useState("");
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [projectId, setProjectId] = useState("");

  async function generate() {
    if (!description.trim() || busy) return;
    setBusy(true);
    setMarkdown(null);
    try {
      const res = await fetch("/api/code/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType,
          description: description.trim(),
          files: contextFiles,
          ...(modelId ? { modelId } : {}),
          ...(projectId ? { projectId } : {}),
        }),
      });
      if (!res.ok) {
        if (await showBetaLimitToast(res)) return;
        toast.error(res.status === 429 ? "Rate limit — try again shortly." : "Doc generation failed.");
        return;
      }
      const data = await res.json();
      setMarkdown(data.markdown);
      setTitle(data.title);
      if (data.savedToProject) toast.success("Saved into the project's knowledge base");
    } catch {
      toast.error("Connection failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 p-3" data-testid="codestudio-docgen">
      <ProjectSelect value={projectId} onChange={setProjectId} testID="codestudio-docgen-project" label="Save into project" />
      <div className="flex gap-1.5">
        {DOC_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setDocType(t)}
            className={`rounded-full border px-2.5 py-1 text-[10px] transition-colors ${
              docType === t
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`codestudio-docgen-type-${t}`}
          >
            {DOC_LABELS[t]}
          </button>
        ))}
      </div>
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value.slice(0, 20000))}
        placeholder="Describe the feature/product (project files already attached as context)…"
        rows={3}
        className="text-xs"
        data-testid="codestudio-docgen-input"
      />
      <Button size="sm" onClick={generate} disabled={busy || !description.trim()} data-testid="codestudio-docgen-generate">
        {busy ? "Writing…" : `Generate ${DOC_LABELS[docType]}`}
      </Button>

      {markdown && (
        <div className="space-y-2 rounded-md border border-border/50 p-3">
          <p className="text-xs font-medium">{title}</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
            {markdown}
          </pre>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadFile(`${docType}.md`, markdown, "text/markdown")}
              data-testid="codestudio-docgen-download"
            >
              ⬇ Download .md
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onProposeWrite(`docs/${docType}.md`, markdown)}
              data-testid="codestudio-docgen-write"
            >
              Write to project (review diff)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
