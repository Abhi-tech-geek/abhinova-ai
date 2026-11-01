import Link from "next/link";
import { Logo } from "@/components/shared/logo";

export const metadata = { title: "Page not found" };

// Every 404 (unknown page, deleted chat, revoked share link, malformed id).
export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4" data-testid="not-found-page">
      <div className="glass w-full max-w-sm rounded-2xl p-6 text-center shadow-glass">
        <div className="flex justify-center">
          <Logo size="md" />
        </div>
        <p className="mt-6 font-display text-5xl font-bold tracking-tight text-gradient">404</p>
        <h1 className="mt-2 text-lg font-semibold">This page isn&apos;t here</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The link may be old, the chat may have been deleted, or a shared chat may have stopped being shared.
        </p>
        <Link
          href="/chat"
          className="brand-gradient mt-6 inline-flex rounded-full px-5 py-2 text-sm font-semibold text-white shadow-glow-primary transition-transform hover:-translate-y-0.5"
          data-testid="not-found-home"
        >
          Go to AbhiNova
        </Link>
      </div>
    </main>
  );
}
