"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SyncStatusBadge } from "@/components/projects/sync-status-badge";
import { getConnector } from "@/lib/connectors/registry";
import type { ProjectSourceRecord } from "@/types/connectors";
import { LocalTime } from "@/components/shared/local-time";

// One attached knowledge source: type icon, item count, last sync, Sync now,
// and Remove (which deletes its synced items + chunks).
export function SourceCard({ source, projectId }: { source: ProjectSourceRecord; projectId: string }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const icon = source.source_type === "url" ? "🔗" : getConnector(source.source_type)?.icon ?? "🔌";
  const subtitle =
    source.source_type === "url"
      ? source.config.url
      : Object.values(source.config).filter(Boolean).join(" · ") || getConnector(source.source_type)?.label;

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sources`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: source.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error === "rate_limited" ? "Slow down — try syncing in a minute." : "Sync couldn't start.");
      } else if (data.outcome?.status === "failed") {
        toast.error("Sync failed", { description: data.outcome.message ?? undefined });
      } else {
        toast.success(
          `Synced ${data.outcome?.processed ?? 0} item(s)${data.outcome?.skippedUnchanged ? ` · ${data.outcome.skippedUnchanged} unchanged` : ""}`,
          { description: data.outcome?.message ?? undefined }
        );
      }
    } finally {
      setSyncing(false);
      router.refresh();
    }
  }

  async function remove() {
    if (!window.confirm(`Remove "${source.title}"? Its synced items and search index are deleted from this project.`)) return;
    setRemoving(true);
    const res = await fetch(`/api/projects/${projectId}/sources`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: source.id }),
    });
    setRemoving(false);
    if (!res.ok) {
      toast.error("Couldn't remove the source.");
      return;
    }
    router.refresh();
  }

  return (
    <li className="rounded-xl border border-border/60 bg-background/30 px-3 py-2.5" data-testid="projects-source-card">
      <div className="flex items-center gap-3">
        <span className="text-lg">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{source.title}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {subtitle} · {source.item_count} item(s) ·{" "}
            {source.last_synced_at ? <>synced <LocalTime iso={source.last_synced_at} format="relative" /></> : "never synced"}
          </p>
        </div>
        <SyncStatusBadge status={syncing ? "syncing" : source.sync_status} />
        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={syncNow} disabled={syncing || removing} data-testid="projects-source-sync">
          {syncing ? "…" : "Sync now"}
        </Button>
        <button
          type="button"
          onClick={remove}
          disabled={removing}
          title="Remove source"
          className="text-xs text-muted-foreground hover:text-destructive"
          data-testid="projects-source-remove"
        >
          ✕
        </button>
      </div>
      {source.sync_error && (
        <p className={`mt-1.5 text-[10px] ${source.sync_status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
          {source.sync_error}
        </p>
      )}
    </li>
  );
}
