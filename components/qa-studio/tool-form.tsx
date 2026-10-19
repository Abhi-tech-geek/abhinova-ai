"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { QaToolDefinition } from "@/lib/qa-tools";

const MAX_CHARS = 20000;

export function ToolForm({
  tool,
  loading,
  onSubmit,
}: {
  tool: QaToolDefinition;
  loading: boolean;
  onSubmit: (input: string, options?: Record<string, string>) => void;
}) {
  const [input, setInput] = useState("");
  const [selectValue, setSelectValue] = useState(
    tool.select?.options[0]?.value ?? ""
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    onSubmit(
      input.trim(),
      tool.select ? { [tool.select.key]: selectValue } : undefined
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass space-y-4 rounded-lg p-5">
      {tool.select && (
        <div className="space-y-1.5">
          <Label htmlFor={`qa-${tool.id}-select`}>{tool.select.label}</Label>
          <select
            id={`qa-${tool.id}-select`}
            value={selectValue}
            onChange={(e) => setSelectValue(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            data-testid={`qastudio-${tool.id}-select`}
          >
            {tool.select.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`qa-${tool.id}-input`}>{tool.inputLabel}</Label>
        <Textarea
          id={`qa-${tool.id}-input`}
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
          placeholder={tool.inputPlaceholder}
          rows={6}
          className="resize-y"
          data-testid={`qastudio-${tool.id}-input`}
        />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-accent">Pro tip:</span> {tool.proTip}
        </p>
        <Button
          type="submit"
          disabled={loading || !input.trim()}
          className="ml-4 shrink-0 shadow-glow-primary"
          data-testid={`qastudio-${tool.id}-generate`}
        >
          {loading ? "Generating…" : "Generate"}
        </Button>
      </div>
    </form>
  );
}
