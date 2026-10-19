"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { emailPasswordSchema } from "@/lib/validators/auth";
import { safeNextPath } from "@/lib/utils";
import { AuthBrandPanel } from "@/components/shared/auth-brand-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type FieldErrors = { email?: string; password?: string };

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  // Resolved at click time (needs window.origin) — open-redirect safe.
  const getNext = () => safeNextPath(nextParam, window.location.origin);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(
    searchParams.get("error") === "auth_callback_failed"
      ? "Sign-in link failed or expired. Please try again."
      : null
  );
  const [pending, setPending] = useState<"password" | "google" | "guest" | null>(null);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = emailPasswordSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldErrors({ email: errors.email?.[0], password: errors.password?.[0] });
      return;
    }
    setFieldErrors({});
    setPending("password");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setPending(null);
    if (error) {
      setFormError(
        error.message === "Invalid login credentials"
          ? "Wrong email or password."
          : error.message
      );
      return;
    }
    router.push(getNext());
    router.refresh();
  }

  async function handleGoogleLogin() {
    setFormError(null);
    setPending("google");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(getNext())}`,
      },
    });
    if (error) {
      setPending(null);
      setFormError(error.message);
    }
  }

  async function handleGuestLogin() {
    setFormError(null);
    setPending("guest");
    const supabase = createClient();
    const { error } = await supabase.auth.signInAnonymously();
    setPending(null);
    if (error) {
      setFormError("Guest login is unavailable right now. Please sign up instead.");
      return;
    }
    router.push("/chat");
    router.refresh();
  }

  return (
    <div className="glass w-full max-w-sm rounded-2xl bg-card/80 p-7 shadow-glass">
      {/* Sign in / Create account tabs (design source) */}
      <div className="flex rounded-2xl bg-secondary/60 p-1">
        <span className="flex-1 rounded-xl bg-card px-4 py-2 text-center text-sm font-semibold shadow-glass">
          Sign in
        </span>
        <Link
          href="/signup"
          className="flex-1 rounded-xl px-4 py-2 text-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          data-testid="login-signup-tab"
        >
          Create account
        </Link>
      </div>

      <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight">
        Welcome back
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sign in to enter the workspace.
      </p>

      <form onSubmit={handlePasswordLogin} className="mt-5 space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60">
              ✉
            </span>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 rounded-xl pl-10"
              data-testid="login-email-input"
            />
          </div>
          {fieldErrors.email && (
            <p className="text-xs text-destructive">{fieldErrors.email}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60">
              🔒
            </span>
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-xl pl-10 pr-10"
              data-testid="login-password-input"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60 hover:text-foreground"
              title={showPassword ? "Hide password" : "Show password"}
              data-testid="login-password-eye"
            >
              {showPassword ? "🙈" : "👁"}
            </button>
          </div>
          {fieldErrors.password && (
            <p className="text-xs text-destructive">{fieldErrors.password}</p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded accent-[hsl(var(--primary))]"
              data-testid="login-remember-me"
            />
            Remember me
          </label>
          <button
            type="button"
            onClick={() =>
              toast.info("Password reset is coming soon", {
                description: "Tab tak Google login ya guest mode use karo.",
              })
            }
            className="text-sm text-primary underline-offset-4 hover:underline"
            data-testid="login-forgot-password"
          >
            Forgot password?
          </button>
        </div>

        {formError && (
          <p className="text-sm text-destructive" data-testid="login-form-error">
            {formError}
          </p>
        )}

        <button
          type="submit"
          className="brand-gradient flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white shadow-glow-primary transition-transform hover:scale-[1.01] disabled:opacity-60"
          disabled={pending !== null}
          data-testid="login-submit-action"
        >
          {pending === "password" ? "Signing in…" : "Sign in →"}
        </button>
      </form>

      <Button
        variant="outline"
        className="mt-3 h-11 w-full rounded-xl"
        onClick={handleGoogleLogin}
        disabled={pending !== null}
        data-testid="login-google-action"
      >
        {pending === "google" ? "Redirecting…" : "🌐 Continue with Google"}
      </Button>

      <div className="my-5 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

      <div className="text-center">
        <button
          type="button"
          onClick={handleGuestLogin}
          disabled={pending !== null}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          data-testid="login-guest-action"
        >
          {pending === "guest" ? "Setting up…" : "Continue as Guest →"}
        </button>
        <p className="mt-1 text-xs text-muted-foreground/70">
          No account needed. Your session stays on this device.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center gap-8 p-6">
      <AuthBrandPanel />
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
