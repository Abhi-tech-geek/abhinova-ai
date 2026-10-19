"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ConnectorDefinition, ConnectorStatus } from "@/types/connectors";

export function ConnectorCard({
  connector,
  status,
  onConnect,
}: {
  connector: ConnectorDefinition;
  status: ConnectorStatus;
  onConnect: (connector: ConnectorDefinition) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    const deleteData = window.confirm(
      `Disconnect ${connector.label}.\n\nOK = also delete everything synced from it in your projects.\nCancel = keep synced data (you can still remove sources later).`
    );
    setBusy(true);
    const res = await fetch(`/api/connectors/${connector.id}/connect?deleteData=${deleteData}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      toast.error("Couldn't disconnect.");
      return;
    }
    toast.success(`${connector.label} disconnected — tokens deleted`, {
      description: data.revoked
        ? "Access was revoked at the provider too."
        : `To fully revoke, remove AbhiNova at ${data.manualRevokeUrl}`,
    });
    router.refresh();
  }

  return (
    <div className="glass flex flex-col rounded-2xl p-4" data-testid={`connectors-card-${connector.id}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{connector.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{connector.label}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{connector.description}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {!status.configured ? (
          <span className="text-[11px] text-muted-foreground" data-testid={`connectors-card-${connector.id}-unconfigured`}>
            Not set up on this server (needs OAuth app keys)
          </span>
        ) : status.connected ? (
          <>
            <span className="flex items-center gap-1.5 text-[11px] text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Connected{status.accountLabel ? ` · ${status.accountLabel}` : ""}
            </span>
            <span className="flex-1" />
            <Button size="sm" variant="outline" onClick={disconnect} disabled={busy} data-testid={`connectors-card-${connector.id}-disconnect`}>
              {busy ? "…" : "Disconnect"}
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => onConnect(connector)} data-testid={`connectors-card-${connector.id}-connect`}>
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}
