"use client";

import { useState } from "react";
import Link from "next/link";
import { BETA_LIMITS, isOpenBeta } from "@/lib/beta/config";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UploadDropzone } from "@/components/documents/upload-dropzone";
import { SourceCard } from "@/components/projects/source-card";
import { AddSourceDialog } from "@/components/projects/add-source-dialog";
import type { DocumentRecord } from "@/types/documents";
import type { ConnectorStatus, ProjectSourceRecord } from "@/types/connectors";

const STATUS_STYLE: Record<string, string> = {
  processing: "bg-warning/15 text-warning",
  ready: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
};

// KNOWLEDGE: files uploaded into the project, existing files attached to it,
// and linked sources (URLs + connectors). All feed one search index.
export function KnowledgePanel({
  projectId,
  documents,
  sources,
  statuses,
  isGuest,
}: {
  projectId: string;
  documents: DocumentRecord[];
  sources: ProjectSourceRecord[];
  statuses: ConnectorStatus[];
  isGuest: boolean;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [library, setLibrary] = useState<DocumentRecord[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  async function openAttach() {
    setAttachOpen(true);
    setSelected([]);
    const supabase = createClient();
    const { data } = await supabase
      .from("documents")
      .select("id, file_name, file_type, storage_path, status, created_at")
      .is("project_id", null)
      .is("source_id", null)
      .eq("status", "ready")
      .order("created_at", { ascending: false });
    setLibrary((data ?? []) as DocumentRecord[]);
  }

  async function attach() {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachDocumentIds: selected }),
    });
    setAttachOpen(false);
    if (!res.ok) {
      toast.error("Couldn't attach the documents.");
      return;
    }
    toast.success(`Attached ${selected.length} document(s)`);
    router.refresh();
  }

  async function detach(doc: DocumentRecord) {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detachDocumentId: doc.id }),
    });
    if (!res.ok) {
      toast.error("Couldn't remove the document.");
      return;
    }
    toast.success(`Removed ${doc.file_name} from this project (still in Documents)`);
    router.refresh();
  }

  const syncedItems = sources.reduce((n, s) => n + s.item_count, 0);

  return (
    <section className="glass rounded-2xl p-5" data-testid="projects-knowledge-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">📚 Knowledge</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {documents.length} file(s) · {sources.length} source(s){syncedItems ? ` · ${syncedItems} synced item(s)` : ""}
          </p>
        </div>
        {!isGuest && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={openAttach} data-testid="projects-knowledge-attach">
              Attach existing
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)} data-testid="projects-knowledge-add-source">
              + Link / connector
            </Button>
          </div>
        )}
      </div>

      <div className="mt-4">
        <UploadDropzone projectId={projectId} />
        {isGuest && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {isOpenBeta() ? (
              <>Open beta: up to {BETA_LIMITS.documents} files. Links and connectors (Jira, GitHub, Notion, Drive) are off during the beta.</>
            ) : (
              <>
                Guest mode: up to 2 files. Links and connectors (Jira, GitHub, Notion, Drive) need a{" "}
                <Link href="/signup" className="text-primary hover:underline" data-testid="projects-knowledge-guest-cta">
                  free account
                </Link>
                .
              </>
            )}
          </p>
        )}
      </div>

      {documents.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/30 px-3 py-2" data-testid="projects-knowledge-doc">
              <span className="text-sm">📄</span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{doc.file_name}</span>
              <span className="text-[10px] uppercase text-muted-foreground">{doc.file_type}</span>
              <Badge variant="outline" className={`border-0 text-[10px] ${STATUS_STYLE[doc.status] ?? ""}`}>
                {doc.status}
              </Badge>
              <button
                type="button"
                title="Remove from project"
                onClick={() => detach(doc)}
                className="text-xs text-muted-foreground hover:text-destructive"
                data-testid="projects-knowledge-doc-remove"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {sources.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {sources.map((source) => (
            <SourceCard key={source.id} source={source} projectId={projectId} />
          ))}
        </ul>
      )}

      <AddSourceDialog projectId={projectId} statuses={statuses} open={addOpen} onOpenChange={setAddOpen} />

      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent className="glass max-w-md">
          <DialogHeader>
            <DialogTitle>Attach existing documents</DialogTitle>
            <DialogDescription>Ready documents from your library that aren&apos;t in a project yet.</DialogDescription>
          </DialogHeader>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {library.length === 0 && <li className="text-xs text-muted-foreground">Nothing to attach.</li>}
            {library.map((doc) => (
              <li key={doc.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-secondary/50">
                  <input
                    type="checkbox"
                    checked={selected.includes(doc.id)}
                    onChange={(e) =>
                      setSelected((prev) => (e.target.checked ? [...prev, doc.id] : prev.filter((id) => id !== doc.id)))
                    }
                    data-testid="projects-attach-checkbox"
                  />
                  {doc.file_name}
                </label>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttachOpen(false)} data-testid="projects-attach-cancel">
              Cancel
            </Button>
            <Button onClick={attach} disabled={selected.length === 0} data-testid="projects-attach-confirm">
              Attach {selected.length || ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
