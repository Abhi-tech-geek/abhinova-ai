import Link from "next/link";
import { Button } from "@/components/ui/button";
import { isOpenBeta } from "@/lib/beta/config";

// Tasteful locked state for guest-restricted surfaces (documents, wellness,
// settings). Honest one-line copy, no dark patterns. In the open beta there
// are no accounts, so it explains the beta instead of pushing a signup.
export function LockedFeature({
  feature,
  description,
  testID,
}: {
  feature: string;
  description: string;
  testID: string;
}) {
  const beta = isOpenBeta();
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div
        className="glass w-full max-w-md rounded-lg p-8 text-center shadow-glass"
        data-testid={testID}
      >
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {beta ? `${feature} is off during the open beta` : `${feature} needs an account`}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {beta ? "Everything else is open to try — accounts come back after the beta." : description}
        </p>
        {beta ? (
          <Button asChild variant="outline" className="mt-6" data-testid={`${testID}-cta`}>
            <Link href="/chat">Back to chat</Link>
          </Button>
        ) : (
          <Button asChild className="mt-6" data-testid={`${testID}-cta`}>
            <Link href="/signup">Create a free account to unlock</Link>
          </Button>
        )}
      </div>
    </main>
  );
}
