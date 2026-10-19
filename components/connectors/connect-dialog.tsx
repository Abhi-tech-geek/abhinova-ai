"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ConnectorDefinition } from "@/types/connectors";

// Shown BEFORE OAuth: exactly what will be accessed (least privilege), then a
// full-page redirect to the provider's consent screen.
export function ConnectDialog({
  connector,
  open,
  onOpenChange,
  returnTo,
}: {
  connector: ConnectorDefinition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnTo: string;
}) {
  if (!connector) return null;
  const href = `/api/connectors/${connector.id}/connect?returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-md">
        <DialogHeader>
          <DialogTitle>
            {connector.icon} Connect {connector.label}
          </DialogTitle>
          <DialogDescription>{connector.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AbhiNova will be able to</p>
          <ul className="space-y-1.5">
            {connector.accessSummary.map((line) => (
              <li key={line} className="flex gap-2 text-sm">
                <span className="text-success">✓</span>
                {line}
              </li>
            ))}
          </ul>
          <p className="pt-2 text-[11px] text-muted-foreground">
            Tokens are encrypted on our server and never sent to your browser. You can disconnect anytime from
            Settings — that revokes access and deletes the tokens.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="connectors-dialog-cancel">
            Cancel
          </Button>
          <Button asChild className="brand-gradient text-white" data-testid="connectors-dialog-continue">
            <a href={href}>Continue to {connector.label} →</a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
