"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { QaToolDefinition } from "@/lib/qa-tools";

const MAX_CHARS = 20000;
const MAX_IMAGE_SIDE = 1600;

/** Shrinks a screenshot to ≤1600px on its longest side as JPEG — small enough to send, sharp enough to read. */
function downscaleImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.fillStyle = "#ffffff"; // transparent PNG areas → white, not black
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad image"));
    };
    img.src = url;
  });
}

export function ToolForm({
  tool,
  loading,
  onSubmit,
  documents = [],
}: {
  tool: QaToolDefinition;
  loading: boolean;
  onSubmit: (input: string, options?: Record<string, string>, image?: string) => void;
  /** When given, the input can be loaded from one of these documents. */
  documents?: { id: string; file_name: string }[];
}) {
  const [input, setInput] = useState("");
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const acceptsScreenshot = tool.id === "bug-report";

  async function attachScreenshot(file: File | null | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      toast.error("Use a PNG, JPG or WebP screenshot.");
      return;
    }
    try {
      setScreenshot(await downscaleImage(file));
    } catch {
      toast.error("Couldn't read that image.");
    }
  }

  async function loadDocument(documentId: string) {
    if (!documentId) return;
    setLoadingDoc(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/text`);
      if (!res.ok) {
        toast.error("Couldn't read that document.");
        return;
      }
      const data: { text: string; truncated: boolean } = await res.json();
      setInput(data.text.slice(0, MAX_CHARS));
      if (data.truncated) toast.info("Long document — loaded the first part. Trim it to the requirements you want tested.");
    } catch {
      toast.error("Connection failed.");
    } finally {
      setLoadingDoc(false);
    }
  }
  const [selectValue, setSelectValue] = useState(
    tool.select?.options[0]?.value ?? ""
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if ((!input.trim() && !screenshot) || loading) return;
    onSubmit(
      input.trim() || "(no notes — see the screenshot)",
      tool.select ? { [tool.select.key]: selectValue } : undefined,
      screenshot ?? undefined
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
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`qa-${tool.id}-input`}>{tool.inputLabel}</Label>
          {/* Lets a first-time visitor see a real result without thinking up an input. */}
          <button
            type="button"
            onClick={() => setInput(tool.example)}
            disabled={loading}
            className="shrink-0 rounded-full border border-primary/40 px-2.5 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            data-testid={`qastudio-${tool.id}-example`}
          >
            ✨ Try an example
          </button>
        </div>
        {documents.length > 0 && (
          <select
            value=""
            onChange={(e) => loadDocument(e.target.value)}
            disabled={loading || loadingDoc}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Load requirements from a document"
            data-testid={`qastudio-${tool.id}-load-document`}
          >
            <option value="">{loadingDoc ? "Loading…" : "📄 Load from one of your documents…"}</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.file_name}
              </option>
            ))}
          </select>
        )}
        <Textarea
          id={`qa-${tool.id}-input`}
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
          placeholder={acceptsScreenshot ? `${tool.inputPlaceholder}\n\nTip: paste a screenshot here with Ctrl+V` : tool.inputPlaceholder}
          rows={6}
          className="resize-y"
          onPaste={(e) => {
            if (!acceptsScreenshot) return;
            const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
            if (file) {
              e.preventDefault();
              void attachScreenshot(file);
            }
          }}
          data-testid={`qastudio-${tool.id}-input`}
        />
        {acceptsScreenshot && (
          <div className="flex flex-wrap items-center gap-3" data-testid="qastudio-bug-report-screenshot">
            {screenshot ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
                <img src={screenshot} alt="Attached screenshot" className="h-16 w-auto rounded-md border border-border object-cover" />
                <button
                  type="button"
                  onClick={() => setScreenshot(null)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                  data-testid="qastudio-bug-report-screenshot-remove"
                >
                  ✕ Remove screenshot
                </button>
              </>
            ) : (
              <label className="cursor-pointer rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
                📸 Add a screenshot
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    void attachScreenshot(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                  data-testid="qastudio-bug-report-screenshot-input"
                />
              </label>
            )}
            <span className="text-[11px] text-muted-foreground">
              The AI reads it to fill in the report. The image isn&apos;t saved.
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-accent">Pro tip:</span> {tool.proTip}
        </p>
        <Button
          type="submit"
          disabled={loading || (!input.trim() && !screenshot)}
          className="ml-4 shrink-0 shadow-glow-primary"
          data-testid={`qastudio-${tool.id}-generate`}
        >
          {loading ? "Generating…" : "Generate"}
        </Button>
      </div>
    </form>
  );
}
