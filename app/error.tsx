"use client";

import { Button } from "@/components/ui/button";

// Global error boundary. Never shows stack traces or internals to the user —
// details go to the console/server logs only.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[app-error]", error.digest ?? error.name);
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="glass max-w-sm rounded-lg p-8 text-center" data-testid="app-error-panel">
        <h2 className="font-display text-xl font-semibold">Something went wrong</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          An unexpected error occurred. Your data is safe.
        </p>
        <Button className="mt-6" onClick={reset} data-testid="app-error-retry">
          Try again
        </Button>
      </div>
    </main>
  );
}
