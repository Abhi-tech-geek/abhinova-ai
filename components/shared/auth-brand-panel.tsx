"use client";

import { BrandStar } from "@/components/shared/logo";

// Animated brand mark from the design source: slow-spinning gradient crescent
// arc + orbiting dot + breathing star core. Sits above the wordmark on the
// auth brand panel.
export function AnimatedBrandMark() {
  return (
    <div className="relative h-40 w-40" aria-hidden>
      {/* soft glow behind everything */}
      <span
        className="brand-gradient absolute -inset-3 rounded-full opacity-30 blur-2xl"
        style={{ animation: "anv-breathe 5s ease-in-out infinite" }}
      />
      {/* crescent arc — conic gradient ring, slow spin */}
      <span
        className="absolute inset-1 rounded-full"
        style={{
          background:
            "conic-gradient(from 220deg, hsl(var(--grad-from)), hsl(var(--grad-to)) 55%, transparent 75%)",
          mask: "radial-gradient(closest-side, transparent 72%, #000 74%)",
          WebkitMask: "radial-gradient(closest-side, transparent 72%, #000 74%)",
          animation: "anv-orbit 14s linear infinite",
        }}
      />
      {/* orbiting dot */}
      <span
        className="absolute inset-0"
        style={{ animation: "anv-orbit-r 8s linear infinite" }}
      >
        <span className="absolute left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-white shadow-glow-primary" />
      </span>
      {/* breathing star core */}
      <span
        className="brand-gradient absolute inset-[26%] grid place-items-center rounded-full"
        style={{
          animation: "anv-breathe 4s ease-in-out infinite",
          boxShadow: "inset 0 0 24px rgba(255,255,255,.4)",
        }}
      >
        <BrandStar className="h-[52%] w-[52%]" />
      </span>
    </div>
  );
}

const FEATURES = [
  { icon: "⚡", label: "Reasoning that thinks first" },
  { icon: "🧪", label: "A full QA studio" },
  { icon: "⌨️", label: "Code Studio built in" },
  { icon: "🛡️", label: "Private by design" },
  { icon: "🌿", label: "Wellness Mode" },
];

// Left brand panel shared by /login and /signup (design source).
export function AuthBrandPanel() {
  return (
    <div className="hidden flex-1 flex-col justify-between p-10 lg:flex">
      <div>
        <AnimatedBrandMark />
        <h1 className="mt-4 font-display text-5xl font-semibold tracking-tight">
          Abhi<span className="text-primary">Nova</span>
        </h1>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
          One calm, fast workspace where your ideas, code and answers finally
          live together — and it actually understands you.
        </p>
        <div className="mt-6 grid max-w-md grid-cols-2 gap-2">
          {FEATURES.map((f) => (
            <span
              key={f.label}
              className="glass flex items-center gap-2 rounded-xl px-3 py-2 text-xs text-muted-foreground"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-[13px] text-primary">
                {f.icon}
              </span>
              {f.label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <span className="glass flex items-center gap-2 rounded-full px-4 py-1.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Online
        </span>
        <span className="glass rounded-full px-4 py-1.5 text-xs text-muted-foreground">
          Private &amp; secure
        </span>
      </div>
    </div>
  );
}
