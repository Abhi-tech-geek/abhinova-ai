"use client";

import { useEffect, useState } from "react";
import type { ModelOption } from "@/lib/models/registry";

// Model dropdown backed by /api/models/list (built-ins + user's BYOK models).
// Empty value = app default (Groq → Gemini fallback chain).
export function ModelPicker({
  value,
  onChange,
  testID = "codestudio-model-picker",
  className = "max-w-56",
}: {
  value: string;
  onChange: (modelId: string) => void;
  testID?: string;
  /** Width constraints — callers in tight rows pass a smaller max width. */
  className?: string;
}) {
  const [models, setModels] = useState<ModelOption[]>([]);

  useEffect(() => {
    fetch("/api/models/list")
      .then((res) => (res.ok ? res.json() : { models: [] }))
      .then((data) => setModels(data.models ?? []))
      .catch(() => setModels([]));
  }, []);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-8 min-w-0 truncate rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring ${className}`}
      title="Model"
      data-testid={testID}
    >
      <option value="">Auto (Groq → Gemini)</option>
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.byok ? "🔑 " : ""}
          {m.label}
        </option>
      ))}
    </select>
  );
}
