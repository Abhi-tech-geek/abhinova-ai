"use client";

import { Button } from "@/components/ui/button";

export default function WellnessError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[wellness-error]", error.digest ?? error.name);
  return (
    <main className="wellness flex min-h-[60vh] items-center justify-center bg-background p-8 text-foreground">
      <div className="glass max-w-sm rounded-2xl p-8 text-center" data-testid="wellness-error-panel">
        <h2 className="font-display text-lg font-semibold">Kuch atak gaya 🌿</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Take a breath — everything you shared is safe. Try once more.
        </p>
        <Button className="mt-5 rounded-full" size="sm" onClick={reset} data-testid="wellness-error-retry">
          Try again
        </Button>
      </div>
    </main>
  );
}
