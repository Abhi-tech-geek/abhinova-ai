"use client";

import { useState } from "react";
import { ConnectorCard } from "@/components/connectors/connector-card";
import { ConnectDialog } from "@/components/connectors/connect-dialog";
import { CONNECTORS } from "@/lib/connectors/registry";
import type { ConnectorDefinition, ConnectorStatus } from "@/types/connectors";

// Settings → Connectors. Renders from the registry; statuses come from the
// server (configured / connected / account label — never tokens).
export function ConnectorGrid({ statuses }: { statuses: ConnectorStatus[] }) {
  const [connecting, setConnecting] = useState<ConnectorDefinition | null>(null);

  return (
    <section className="glass rounded-lg p-5" data-testid="settings-connectors-section">
      <h2 className="font-display text-base font-semibold">Connectors</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Connect tools once, then add them as knowledge sources inside any project. Read-only access; tokens are
        encrypted and never leave our server.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {CONNECTORS.map((connector) => (
          <ConnectorCard
            key={connector.id}
            connector={connector}
            status={statuses.find((s) => s.id === connector.id) ?? { id: connector.id, configured: false, connected: false, accountLabel: null }}
            onConnect={setConnecting}
          />
        ))}
      </div>
      <ConnectDialog
        connector={connecting}
        open={connecting !== null}
        onOpenChange={(open) => !open && setConnecting(null)}
        returnTo="/settings"
      />
    </section>
  );
}
