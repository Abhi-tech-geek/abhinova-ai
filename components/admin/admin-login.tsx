import { Logo } from "@/components/shared/logo";

const MESSAGES: Record<string, string> = {
  wrong_key: "That key didn't match. Check ADMIN_DASHBOARD_TOKEN.",
  slow_down: "Too many attempts — wait a minute and try again.",
  not_configured: "ADMIN_DASHBOARD_TOKEN isn't set on the server.",
};

// Owner key prompt for /admin. A plain HTML form (POST /admin/login) — works
// without JavaScript and never puts the key in a URL.
export function AdminLogin({ error, configured }: { error?: string; configured: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4" data-testid="admin-login">
      <div className="glass w-full max-w-sm rounded-[1.5rem] p-7 shadow-glass">
        <Logo size="sm" />
        <h1 className="mt-5 font-display text-xl font-semibold tracking-tight">Owner dashboard</h1>
        {configured ? (
          <form action="/admin/login" method="post" className="mt-4 space-y-3">
            <label htmlFor="admin-key" className="text-xs text-muted-foreground">
              Access key
            </label>
            <input
              id="admin-key"
              name="key"
              type="password"
              required
              autoFocus
              autoComplete="current-password"
              className="w-full rounded-xl border border-border/70 bg-background/50 px-3.5 py-2.5 text-sm outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
              data-testid="admin-login-key"
            />
            {error && (
              <p className="text-xs text-destructive" role="alert" data-testid="admin-login-error">
                {MESSAGES[error] ?? "Couldn't sign in."}
              </p>
            )}
            <button
              type="submit"
              className="brand-gradient w-full rounded-full py-2.5 text-sm font-semibold text-white shadow-glow-primary transition-transform hover:-translate-y-0.5 active:scale-95"
              data-testid="admin-login-submit"
            >
              Open dashboard
            </button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground" data-testid="admin-login-disabled">
            The dashboard is disabled. Set <code className="rounded bg-secondary px-1 font-mono text-xs">ADMIN_DASHBOARD_TOKEN</code>{" "}
            (16+ random characters) in the server environment to turn it on.
          </p>
        )}
      </div>
    </main>
  );
}
