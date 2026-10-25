"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { FEEDBACK_MAX_CHARS, type FeedbackCategory } from "@/types/feedback";

const CATEGORIES: { id: FeedbackCategory; icon: string; label: string; placeholder: string }[] = [
  { id: "bug", icon: "🐞", label: "Bug", placeholder: "What went wrong? What did you expect instead?" },
  { id: "idea", icon: "💡", label: "Idea", placeholder: "What would make AbhiNova more useful for you?" },
  { id: "praise", icon: "❤️", label: "Love it", placeholder: "What did you like? It really helps to know!" },
  { id: "other", icon: "💭", label: "Other", placeholder: "Anything on your mind…" },
];

const ERRORS: Record<string, string> = {
  feedback_limit_reached: "You've sent a lot of feedback today — thank you! Please try again tomorrow.",
  rate_limited: "Easy there — try again in a minute.",
  invalid_request: "Please write a little more.",
};

/**
 * "Send feedback" — a sidebar row that opens a small dialog: pick a category,
 * write a note, send. The current page is attached automatically.
 */
export function FeedbackDialog({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const active = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];
  const canSend = message.trim().length >= 3 && !sending;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Reset after the close animation.
      setTimeout(() => {
        setSent(false);
        setMessage("");
        setCategory("idea");
      }, 200);
    }
  }

  async function send() {
    if (!canSend) return;
    setSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, message: message.trim(), page: pathname.slice(0, 200) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(ERRORS[data.error as string] ?? "Couldn't send feedback. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      toast.error("Connection problem — please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          title={collapsed ? "Send feedback" : undefined}
          className={`flex h-9 items-center rounded-lg text-sm text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground ${
            collapsed ? "w-9 justify-center" : "w-full gap-2.5 px-2.5"
          }`}
          data-testid="sidebar-feedback-open"
        >
          <span className="grid w-6 shrink-0 place-items-center" aria-hidden>💬</span>
          {!collapsed && <span className="truncate">Send feedback</span>}
        </button>
      </DialogPrimitive.Trigger>

      <DialogPortal>
        <DialogOverlay className="bg-background/70 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="glass fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto overflow-x-hidden rounded-[1.5rem] border border-border/70 p-6 shadow-glass duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          data-testid="feedback-dialog"
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full brand-gradient opacity-20 blur-3xl" />
          </div>

          <DialogPrimitive.Close
            className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close"
            data-testid="feedback-close"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
            </svg>
          </DialogPrimitive.Close>

          {sent ? (
            <div className="relative py-6 text-center duration-300 animate-in fade-in zoom-in-95" data-testid="feedback-thanks">
              <span className="brand-gradient mx-auto grid h-14 w-14 place-items-center rounded-2xl text-2xl text-white shadow-glow-primary" aria-hidden>
                🙏
              </span>
              <DialogPrimitive.Title className="mt-4 font-display text-xl font-semibold tracking-tight">
                Thank you!
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1.5 text-sm text-muted-foreground">
                Your feedback reached Abhinav directly. It genuinely shapes what gets built next.
              </DialogPrimitive.Description>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="brand-gradient mt-6 rounded-full px-5 py-2 text-sm font-semibold text-white shadow-glow-primary transition-transform hover:-translate-y-0.5 active:scale-95"
                data-testid="feedback-done"
              >
                Back to work
              </button>
            </div>
          ) : (
            <form
              className="relative"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <DialogPrimitive.Title className="pr-8 font-display text-xl font-semibold tracking-tight">
                Send feedback
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                Found a bug or have an idea? Tell us — every note is read.
              </DialogPrimitive.Description>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Feedback type">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={category === c.id}
                    onClick={() => setCategory(c.id)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors ${
                      category === c.id
                        ? "border-primary/60 bg-primary/10 text-foreground"
                        : "border-border/70 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    }`}
                    data-testid={`feedback-category-${c.id}`}
                  >
                    <span className="text-lg leading-none" aria-hidden>{c.icon}</span>
                    {c.label}
                  </button>
                ))}
              </div>

              <label htmlFor="feedback-message" className="sr-only">
                Your feedback
              </label>
              <textarea
                id="feedback-message"
                autoFocus
                value={message}
                maxLength={FEEDBACK_MAX_CHARS}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
                }}
                placeholder={active.placeholder}
                rows={5}
                className="mt-4 w-full resize-none rounded-xl border border-border/70 bg-background/50 px-3.5 py-3 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                data-testid="feedback-message"
              />
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="truncate">📍 Includes the page you&apos;re on ({pathname})</span>
                <span className={message.length > FEEDBACK_MAX_CHARS - 100 ? "text-warning" : ""}>
                  {message.length}/{FEEDBACK_MAX_CHARS}
                </span>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <DialogPrimitive.Close
                  type="button"
                  className="rounded-full border border-border/70 px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
                  data-testid="feedback-cancel"
                >
                  Cancel
                </DialogPrimitive.Close>
                <button
                  type="submit"
                  disabled={!canSend}
                  className="brand-gradient rounded-full px-5 py-2 text-sm font-semibold text-white shadow-glow-primary transition-transform hover:-translate-y-0.5 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                  data-testid="feedback-send"
                >
                  {sending ? "Sending…" : "Send feedback"}
                </button>
              </div>
            </form>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
