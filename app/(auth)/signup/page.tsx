"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { emailPasswordSchema } from "@/lib/validators/auth";
import { AuthBrandPanel } from "@/components/shared/auth-brand-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type FieldErrors = { email?: string; password?: string };

// Dual-purpose page:
// - Signed out → "Create your workspace" (design source) + Google + guest.
// - Anonymous (guest) session → "save your account" upgrade: updateUser() /
//   linkIdentity() convert the SAME user, so every guest conversation and QA
//   artifact keeps its user_id — no data migration needed.
export default function SignupPage() {
  const router = useRouter();

  const [isUpgrade, setIsUpgrade] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<"password" | "google" | "guest" | null>(null);
  const [confirmEmailSent, setConfirmEmailSent] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsUpgrade(user?.is_anonymous ?? false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
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

    if (isUpgrade) {
      // Convert the anonymous user in place — same user_id, data preserved.
      const { data, error } = await supabase.auth.updateUser({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (error) {
        setPending(null);
        setFormError(error.message);
        return;
      }
      if (data.user) {
        await supabase.from("profiles").update({ is_guest: false }).eq("id", data.user.id);
      }
      setPending(null);
      toast.success("Account saved — your data is safe now.", {
        description: "Check your email to confirm your address.",
      });
      router.push("/chat");
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/chat` },
    });
    setPending(null);
    if (error) {
      setFormError(error.message);
      return;
    }
    // Email confirmation disabled in Supabase → already signed in.
    if (data.session) {
      router.push("/chat");
      router.refresh();
      return;
    }
    setConfirmEmailSent(true);
  }

  async function handleGoogle() {
    setFormError(null);
    setPending("google");
    const supabase = createClient();
    const options = {
      redirectTo: `${window.location.origin}/auth/callback?next=/chat`,
    };
    const { error } = isUpgrade
      ? await supabase.auth.linkIdentity({ provider: "google", options })
      : await supabase.auth.signInWithOAuth({ provider: "google", options });
    if (error) {
      setPending(null);
      setFormError(error.message);
    }
  }

  async function handleGuest() {
    setFormError(null);
    setPending("guest");
    const supabase = createClient();
    const { error } = await supabase.auth.signInAnonymously();
    setPending(null);
    if (error) {
      setFormError("Guest login is unavailable right now.");
      return;
    }
    router.push("/chat");
    router.refresh();
  }

  if (confirmEmailSent) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="glass w-full max-w-sm rounded-2xl bg-card/80 p-8 text-center shadow-glass" data-testid="signup-confirm-panel">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Check your email
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a confirmation link to <span className="text-foreground">{email}</span>.
            Click it to activate your account, then sign in.
          </p>
          <Button asChild variant="outline" className="mt-6 rounded-xl" data-testid="signup-confirm-login-link">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center gap-8 p-6">
      {!isUpgrade && <AuthBrandPanel />}
      <div className="glass w-full max-w-sm rounded-2xl bg-card/80 p-7 shadow-glass">
        {!isUpgrade && (
          <div className="flex rounded-2xl bg-secondary/60 p-1">
            <Link
              href="/login"
              className="flex-1 rounded-xl px-4 py-2 text-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              data-testid="signup-login-tab"
            >
              Sign in
            </Link>
            <span className="flex-1 rounded-xl bg-card px-4 py-2 text-center text-sm font-semibold shadow-glass">
              Create account
            </span>
          </div>
        )}

        <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">
          {isUpgrade ? "Save your account" : "Create your workspace"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isUpgrade
            ? "Add an email and password — all your guest chats and history stay with you."
            : "Start free — no credit card needed."}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
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
                data-testid="signup-email-input"
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
                autoComplete="new-password"
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-xl pl-10 pr-10"
                data-testid="signup-password-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60 hover:text-foreground"
                title={showPassword ? "Hide password" : "Show password"}
                data-testid="signup-password-eye"
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="text-xs text-destructive">{fieldErrors.password}</p>
            )}
          </div>

          {formError && (
            <p className="text-sm text-destructive" data-testid="signup-form-error">
              {formError}
            </p>
          )}

          <button
            type="submit"
            className="brand-gradient flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white shadow-glow-primary transition-transform hover:scale-[1.01] disabled:opacity-60"
            disabled={pending !== null}
            data-testid="signup-submit-action"
          >
            {pending === "password"
              ? isUpgrade
                ? "Saving…"
                : "Creating…"
              : isUpgrade
                ? "Save my account →"
                : "Create account →"}
          </button>
        </form>

        <Button
          variant="outline"
          className="mt-3 h-11 w-full rounded-xl"
          onClick={handleGoogle}
          disabled={pending !== null}
          data-testid="signup-google-action"
        >
          {pending === "google" ? "Redirecting…" : "🌐 Continue with Google"}
        </Button>

        {!isUpgrade && (
          <>
            <div className="my-5 flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>
            <div className="text-center">
              <button
                type="button"
                onClick={handleGuest}
                disabled={pending !== null}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                data-testid="signup-guest-action"
              >
                {pending === "guest" ? "Setting up…" : "Continue as Guest →"}
              </button>
              <p className="mt-1 text-xs text-muted-foreground/70">
                No account needed. Your session stays on this device.
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
