"use client";

import { useReducedMotion } from "framer-motion";

// Design source thinking state: conic spinner ring around a breathing gradient
// core, with a blinking "Reasoning…" label.
export function ThinkingOrb({ testID = "chat-thinking-orb" }: { testID?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex items-center gap-3 px-1 py-2" data-testid={testID}>
      <span className="relative h-8 w-8 shrink-0">
        {!reduceMotion && (
          <span
            className="absolute -inset-1 rounded-full"
            style={{
              background:
                "conic-gradient(from 0deg, transparent, hsl(var(--primary)), transparent 60%)",
              animation: "anv-orbit 1.4s linear infinite",
              mask: "radial-gradient(closest-side, transparent 64%, #000 66%)",
              WebkitMask: "radial-gradient(closest-side, transparent 64%, #000 66%)",
            }}
          />
        )}
        <span
          className="brand-gradient absolute inset-[7px] rounded-full shadow-glow-primary"
          style={reduceMotion ? undefined : { animation: "anv-breathe 1.6s ease-in-out infinite" }}
        />
      </span>
      <span className="text-[13px] text-muted-foreground">
        Reasoning
        <span style={reduceMotion ? undefined : { animation: "anv-blink 1.2s infinite" }}>…</span>
      </span>
    </div>
  );
}
