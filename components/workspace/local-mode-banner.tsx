import Link from "next/link";

// Shown instead of the beta banner when the server runs in Local Mode
// (OLLAMA_URL set): makes it obvious the AI is running on this computer.
export function LocalModeBanner({ model }: { model: string }) {
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 border-b border-success/30 bg-success/10 px-4 py-1.5 text-[11px] text-muted-foreground backdrop-blur"
      data-testid="workspace-local-mode-banner"
    >
      <span className="font-medium text-success">🔒 Local Mode</span>
      <span>
        AI runs on this computer (<span className="font-mono text-foreground">{model}</span>) — nothing is
        sent to a cloud model
      </span>
      <Link
        href="/privacy"
        className="font-medium text-primary underline-offset-4 hover:underline"
        data-testid="workspace-local-mode-privacy"
      >
        Privacy
      </Link>
    </div>
  );
}
