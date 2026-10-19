"use client";

import { Button } from "@/components/ui/button";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[workspace-error]", error.digest ?? error.name);
  return (
    <main className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="glass max-w-sm rounded-lg p-8 text-center" data-testid="workspace-error-panel">
        <h2 className="font-display text-lg font-semibold">This page hit a snag</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Try again — your conversations and data are safe.
        </p>
        <Button className="mt-5" size="sm" onClick={reset} data-testid="workspace-error-retry">
          Try again
        </Button>
      </div>
    </main>
  );
}
