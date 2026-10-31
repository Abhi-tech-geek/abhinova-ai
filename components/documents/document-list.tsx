"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DocumentRecord, RetrievedSource } from "@/types/documents";
import { LocalTime } from "@/components/shared/local-time";

const statusStyle: Record<string, string> = {
  processing: "bg-warning/15 text-warning",
  ready: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
};

export function DocumentList({ documents }: { documents: DocumentRecord[] }) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<DocumentRecord | null>(null);
  const [summary, setSummary] = useState<{ name: string; text: string } | null>(null);
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [reindexingId, setReindexingId] = useState<string | null>(null);

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    const res = await fetch(`/api/documents/${target.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      toast.error("Delete failed. Please try again.");
      return;
    }
    toast.success(`Deleted ${target.file_name}`);
    router.refresh();
  }

  // Indexed in the other mode (Online vs Local): rebuild its search index here.
  async function reindex(doc: DocumentRecord) {
    setReindexingId(doc.id);
    try {
      const res = await fetch("/api/documents/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id }),
      });
      if (!res.ok) {
        toast.error("Re-index failed. Please try again.");
        return;
      }
      toast.success(`${doc.file_name} is searchable in this mode now`);
      router.refresh();
    } catch {
      toast.error("Connection failed.");
    } finally {
      setReindexingId(null);
    }
  }

  async function summarize(doc: DocumentRecord) {
    setSummarizingId(doc.id);
    try {
      const res = await fetch("/api/documents/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "Give a concise summary of this document.",
          documentIds: [doc.id],
          mode: "summarize",
        }),
      });
      if (!res.ok) {
        toast.error("Summarize failed. Please try again.");
        return;
      }
      const data: { answer: string; sources: RetrievedSource[] } = await res.json();
      setSummary({ name: doc.file_name, text: data.answer });
    } catch {
      toast.error("Connection failed.");
    } finally {
      setSummarizingId(null);
    }
  }

  if (documents.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground" data-testid="documents-list-empty">
        No documents yet — upload one above to start asking questions.
      </p>
    );
  }

  return (
    <>
      <ul className="space-y-2" data-testid="documents-list">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className="glass flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-4 py-3"
            data-testid="documents-list-item"
          >
            {/* Phones: name + notes on their own line, actions below. */}
            <div className="min-w-0 flex-1 basis-full sm:basis-0">
              <p className="truncate text-sm font-medium">{doc.file_name}</p>
              <p className="text-[11px] text-muted-foreground">
                {doc.file_type.toUpperCase()} · <LocalTime iso={doc.created_at} />
              </p>
              {doc.indexedIn && (
                <p className="mt-0.5 text-[11px] text-warning" data-testid="documents-list-other-mode">
                  Indexed in {doc.indexedIn === "local" ? "Local" : "Online"} Mode, so search here skips it.
                  {doc.storage_path ? " Re-index to use it." : " Re-sync its source to use it."}
                </p>
              )}
            </div>
            {doc.indexedIn && doc.storage_path && (
              <Button
                size="sm"
                variant="outline"
                disabled={reindexingId !== null}
                onClick={() => reindex(doc)}
                data-testid="documents-reindex-action"
              >
                {reindexingId === doc.id ? "Re-indexing…" : "Re-index"}
              </Button>
            )}
            <Badge variant="outline" className={`border-0 text-[10px] ${statusStyle[doc.status]}`}>
              {doc.status === "processing" && (
                <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
              )}
              {doc.status}
            </Badge>
            {doc.status === "ready" && (
              <Button
                size="sm"
                variant="outline"
                disabled={summarizingId !== null}
                onClick={() => summarize(doc)}
                data-testid="documents-summarize-action"
              >
                {summarizingId === doc.id ? "Summarizing…" : "Summarize"}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteTarget(doc)}
              data-testid="documents-delete-action"
            >
              🗑
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="glass max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
            <DialogDescription>
              “{deleteTarget?.file_name}” — the file, its chunks, and its search
              index will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} data-testid="documents-delete-cancel">
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} data-testid="documents-delete-confirm">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={summary !== null} onOpenChange={(open) => !open && setSummary(null)}>
        <DialogContent className="glass max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Summary — {summary?.name}</DialogTitle>
          </DialogHeader>
          <p className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground" data-testid="documents-summary-text">
            {summary?.text}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
