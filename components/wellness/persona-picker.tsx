"use client";

import type { Persona } from "@/types/wellness";

const PERSONA_META: { id: Persona; label: string; hint: string }[] = [
  { id: "dost", label: "🫂 Dost", hint: "warm friend" },
  { id: "sage", label: "🌙 Sage", hint: "calm & reflective" },
  { id: "coach", label: "🌱 Coach", hint: "gently motivating" },
  { id: "socrates", label: "🕯️ Socrates", hint: "thoughtful questions" },
];

export function PersonaPicker({
  persona,
  onChange,
  disabled = false,
}: {
  persona: Persona;
  onChange: (persona: Persona) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="wellness-persona-picker">
      {PERSONA_META.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(p.id)}
          title={p.hint}
          className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50 ${
            persona === p.id
              ? "border-primary/60 bg-primary/15 text-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
          data-testid={`wellness-persona-${p.id}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
