"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { JournalAnalysisOutput } from "@/types/wellness";
import { showBetaLimitToast } from "@/lib/beta/client";

export function JournalEditor() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [analysis, setAnalysis] = useState<JournalAnalysisOutput | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function analyze() {
    if (!content.trim() || analyzing) return;
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await fetch("/api/wellness/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });
      if (!res.ok) {
        if (await showBetaLimitToast(res)) return;
        toast.error(
          res.status === 429
            ? "Ek minute mein dobara try karo."
            : "Couldn't reflect on this right now — try again."
        );
        return;
      }
      const data = await res.json();
      setAnalysis(data.analysis);
    } catch {
      toast.error("Connection failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveEntry(withReframe: boolean) {
    if (!content.trim() || saving) return;
    setSaving(true);
    const res = await fetch("/api/wellness/journal/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: content.trim(),
        distortions: analysis?.distortions ?? null,
        reframe: withReframe ? (analysis?.reframe ?? null) : null,
      }),
    }).catch(() => null);
    setSaving(false);
    if (res?.status === 401) {
      router.push("/login");
      return;
    }
    if (!res?.ok) {
      toast.error("Couldn't save the entry.");
      return;
    }
    toast.success("Journal entry saved 🌿");
    setContent("");
    setAnalysis(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-4">
        <p className="flex items-center gap-2 px-1 pb-2 text-sm font-medium">
          ✍️ New entry
        </p>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value.slice(0, 8000))}
          placeholder="Write freely. Nothing here is judged…"
          rows={6}
          className="resize-y rounded-xl bg-background/60 text-sm"
          data-testid="wellness-journal-input"
        />
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={analyze}
            disabled={!content.trim() || analyzing}
            data-testid="wellness-journal-analyze"
          >
            {analyzing ? "Reflecting…" : "🪞 Reflect with AI"}
          </Button>
          <button
            type="button"
            onClick={() => saveEntry(false)}
            disabled={!content.trim() || saving}
            className="brand-gradient h-9 flex-1 rounded-full text-sm font-medium text-white shadow-glow-primary transition-transform hover:scale-[1.01] disabled:opacity-50"
            data-testid="wellness-journal-save-plain"
          >
            Save entry
          </button>
        </div>
      </div>

      {analysis && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass space-y-3 rounded-2xl p-5"
          data-testid="wellness-journal-analysis"
        >
          <p className="text-sm text-muted-foreground">{analysis.gentleNote}</p>
          {analysis.distortions.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Thought patterns that might be at play
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {analysis.distortions.map((d) => (
                  <Badge key={d} variant="outline" className="border-accent/40 bg-accent/10 text-[10px] text-accent">
                    {d}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-primary">
              A kinder way to see it
            </p>
            <p className="mt-1 text-sm">{analysis.reframe}</p>
          </div>
          <Button
            size="sm"
            onClick={() => saveEntry(true)}
            disabled={saving}
            data-testid="wellness-journal-save-reframe"
          >
            {saving ? "Saving…" : "Save entry with reframe"}
          </Button>
        </motion.div>
      )}
    </div>
  );
}
