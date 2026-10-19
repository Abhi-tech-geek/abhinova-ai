"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { BETA_LIMITS, isOpenBeta } from "@/lib/beta/config";

// First-visit product tour on the home screen (/chat): what AbhiNova does,
// one feature per step, Back / Next / Skip, remembered per browser. Can be
// reopened any time from the account menu ("Product tour").

const SEEN_KEY = "anv:welcome-tour-v1";
export const OPEN_TOUR_EVENT = "anv:open-welcome-tour";

/** Reopen the tour from anywhere (e.g. the account menu). */
export function openWelcomeTour() {
  window.dispatchEvent(new Event(OPEN_TOUR_EVENT));
}

interface Step {
  icon: string;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
}

const FEATURE_STEPS: Step[] = [
  {
    icon: "✦",
    eyebrow: "Welcome",
    title: "Meet AbhiNova AI",
    body: "Your productivity-first AI workspace — chat, research, test and build, all in one place.",
    points: [
      "Talks your language: English, Hindi or Hinglish",
      "Fast answers (Groq), with Gemini as automatic backup",
      "Your chats, files and projects stay private to you",
    ],
  },
  {
    icon: "💬",
    eyebrow: "Chats",
    title: "Ask anything, your way",
    body: "A smart assistant for writing, ideas, explanations and everyday work.",
    points: [
      "Speak instead of typing 🎤 — and let it read replies aloud",
      "Pick the AI model from the box under the message field",
      "Press Ctrl + K to jump anywhere in the app",
    ],
  },
  {
    icon: "📁",
    eyebrow: "Projects",
    title: "Your own mini-AI for every project",
    body: "Give a project its own files, links and instructions — its chats answer only from that knowledge.",
    points: [
      "Add PDF, Word, PowerPoint, Excel, CSV, Markdown or code files",
      "Every answer cites its source — down to the page, slide or sheet row",
      "Custom instructions + notes the AI always remembers",
    ],
  },
  {
    icon: "🧪",
    eyebrow: "QA Studio",
    title: "A copilot built for testers",
    body: "Eight focused tools that turn a requirement into ready-to-use QA work in seconds.",
    points: [
      "Test cases, bug reports, edge cases and regression checklists",
      "API tests, SQL checks, test data and automation snippets",
      "Export results to CSV or Markdown",
    ],
  },
  {
    icon: "⌨️",
    eyebrow: "Documents & Code Studio",
    title: "Read files. Understand code.",
    body: "Ask questions across your documents, or open a local project folder and work with your code.",
    points: [
      "Documents: upload, ask, and compare files with citations",
      "Code Studio: explain, fix and refactor — every change shown as a diff you approve",
      "Generate PRDs, tech docs and API specs from a short description",
    ],
  },
  {
    icon: "🌿",
    eyebrow: "Wellness (optional)",
    title: "A calm corner when you need it",
    body: "Switch it on from your account menu — it stays separate from your work.",
    points: [
      "Talk with Dost, Sage, Coach or Socrates",
      "Mood check-ins, a private journal and gentle weekly insights",
      "An AI companion — not a replacement for a professional therapist",
    ],
  },
];

const BETA_STEP: Step = {
  icon: "🚀",
  eyebrow: "Open beta",
  title: "You're an early tester!",
  body: "No sign-up needed. To keep it free for everyone, each tester gets:",
  points: [
    `${BETA_LIMITS.chats} chats · ${BETA_LIMITS.messagesPerChat} messages each`,
    `${BETA_LIMITS.aiCallsPerUserPerDay} AI replies a day · ${BETA_LIMITS.qaRunsPerDay} QA Studio runs a day`,
    `${BETA_LIMITS.documents} document uploads · ${BETA_LIMITS.projects} project — the banner on top shows what's left`,
  ],
};

const FINAL_STEP: Step = {
  icon: "🚀",
  eyebrow: "All set",
  title: "You're ready to go",
  body: "Start with a chat, or create a project and add your first file.",
  points: [
    "Your history lives in the sidebar, grouped by day",
    "Reopen this tour any time from your account menu",
    "Light or dark? Switch the theme from the account menu",
  ],
};

export function WelcomeTour() {
  const pathname = usePathname();
  const steps = [...FEATURE_STEPS, isOpenBeta() ? BETA_STEP : FINAL_STEP];
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  // Auto-open once, on the home screen, for first-time visitors.
  useEffect(() => {
    if (pathname !== "/chat") return;
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      seen = true; // storage blocked → don't nag on every visit
    }
    if (seen) return;
    const timer = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(timer);
  }, [pathname]);

  // Manual reopen from the account menu.
  useEffect(() => {
    const reopen = () => {
      setIndex(0);
      setDirection(1);
      setOpen(true);
    };
    window.addEventListener(OPEN_TOUR_EVENT, reopen);
    return () => window.removeEventListener(OPEN_TOUR_EVENT, reopen);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next >= steps.length) return;
      setDirection(next > index ? 1 : -1);
      setIndex(next);
    },
    [index, steps.length]
  );

  const isLast = index === steps.length - 1;
  const step = steps[index];

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogPortal>
        <DialogOverlay className="bg-background/70 backdrop-blur-sm" />
        <DialogPrimitive.Content
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") goTo(index + 1);
            if (e.key === "ArrowLeft") goTo(index - 1);
          }}
          className="glass fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto overflow-x-hidden rounded-[1.5rem] border border-border/70 shadow-glass duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          data-testid="welcome-tour"
        >
          {/* Ambient brand glow */}
          {/* Clipped layer so the glow never makes the card scrollable. */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full brand-gradient opacity-20 blur-3xl" />
            <div className="absolute -bottom-28 -left-20 h-56 w-56 rounded-full bg-accent opacity-10 blur-3xl" />
          </div>

          {/* Top bar: step counter + close */}
          <div className="relative flex items-center justify-between px-6 pt-5">
            <span className="rounded-full border border-border/70 bg-background/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground" data-testid="welcome-tour-counter">
              {index + 1} / {steps.length}
            </span>
            <DialogPrimitive.Close
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close tour"
              data-testid="welcome-tour-close"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
              </svg>
            </DialogPrimitive.Close>
          </div>

          {/* Step content */}
          <div className="relative min-h-[22rem] px-6 pb-2 pt-4 sm:min-h-[20.5rem] sm:px-8">
            {/* Keyed CSS enter animation: the new step renders immediately (no
                exit-animation wait that could stall in a background tab). */}
            <div
              key={index}
              className={`duration-300 ease-out animate-in fade-in motion-reduce:animate-none ${
                direction > 0 ? "slide-in-from-right-6" : "slide-in-from-left-6"
              }`}
            >
                <span
                  className={`grid h-14 w-14 place-items-center rounded-2xl text-2xl shadow-glow-primary ${
                    step.icon === "✦" ? "brand-gradient text-white" : "border border-border/70 bg-background/60"
                  }`}
                  aria-hidden
                >
                  {step.icon}
                </span>
                <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{step.eyebrow}</p>
                <DialogPrimitive.Title className="mt-1.5 font-display text-2xl font-semibold leading-tight tracking-tight">
                  {step.title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </DialogPrimitive.Description>
                <ul className="mt-5 space-y-2.5">
                  {step.points.map((point) => (
                    <li key={point} className="flex items-start gap-2.5 text-sm leading-snug">
                      <span className="brand-gradient mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" aria-hidden>
                        ✓
                      </span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
            </div>
          </div>

          {/* Progress dots */}
          <div className="relative flex justify-center gap-1.5 px-6 pt-3" role="tablist" aria-label="Tour steps">
            {steps.map((s, i) => (
              <button
                key={s.eyebrow}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Step ${i + 1}: ${s.eyebrow}`}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === index ? "brand-gradient w-6" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                }`}
                data-testid={`welcome-tour-dot-${i}`}
              />
            ))}
          </div>

          {/* Footer actions */}
          <div className="relative flex items-center gap-2 px-6 pb-6 pt-5 sm:px-8">
            {!isLast && (
              <button
                type="button"
                onClick={close}
                className="rounded-full px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                data-testid="welcome-tour-skip"
              >
                Skip tour
              </button>
            )}
            <span className="flex-1" />
            {index > 0 && (
              <button
                type="button"
                onClick={() => goTo(index - 1)}
                className="rounded-full border border-border/70 px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
                data-testid="welcome-tour-back"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? close() : goTo(index + 1))}
              className="brand-gradient rounded-full px-5 py-2 text-sm font-semibold text-white shadow-glow-primary transition-transform hover:-translate-y-0.5 active:scale-95"
              data-testid={isLast ? "welcome-tour-finish" : "welcome-tour-next"}
              autoFocus
            >
              {isLast ? "Start exploring" : "Next →"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
