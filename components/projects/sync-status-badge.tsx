import type { SyncStatus } from "@/types/connectors";

const STYLE: Record<SyncStatus, { label: string; className: string }> = {
  idle: { label: "Idle", className: "bg-secondary text-muted-foreground" },
  syncing: { label: "Syncing…", className: "bg-primary/15 text-primary" },
  synced: { label: "Synced", className: "bg-success/15 text-success" },
  failed: { label: "Failed", className: "bg-destructive/15 text-destructive" },
};

export function SyncStatusBadge({ status }: { status: SyncStatus }) {
  const s = STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${s.className}`}
      data-testid={`projects-sync-status-${status}`}
    >
      {status === "syncing" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
      {s.label}
    </span>
  );
}
