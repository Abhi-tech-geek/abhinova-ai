"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { showBetaLimitToast } from "@/lib/beta/client";
import { extractClaims } from "@/lib/rag/verify";
import type { AnswerTrace, CitationCheck, RetrievedSource } from "@/types/documents";

// Under a document answer: "Check sources" (an AI judge reads every cited
// statement next to its passage) and "How this answer was made" (the 9 RAG
// stages with the real numbers from this answer).

const STATUS: Record<CitationCheck["status"], { icon: string; label: string; tone: string }> = {
  supported: { icon: "✓", label: "Supported", tone: "text-success" },
  partial: { icon: "~", label: "Partly supported", tone: "text-warning" },
  unsupported: { icon: "✗", label: "Not in the source", tone: "text-destructive" },
  missing: { icon: "?", label: "Cites a missing source", tone: "text-destructive" },
  unchecked: { icon: "–", label: "Not checked", tone: "text-muted-foreground" },
};

const PROVIDER_NAMES: Record<string, string> = {
  groq: "Groq",
  gemini: "Gemini (backup)",
  openai: "OpenAI",
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  ollama: "The local AI on this computer",
};

export function AnswerInsights({
  answer,
  sources,
  trace,
}: {
  answer: string;
  sources: RetrievedSource[];
  trace?: AnswerTrace | null;
}) {
  const [checks, setChecks] = useState<CitationCheck[] | null>(null);
  const [checking, setChecking] = useState(false);
  const citedStatements = extractClaims(answer).length;

  async function checkSources() {
    setChecking(true);
    try {
      const res = await fetch("/api/documents/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, sources: sources.map((s) => ({ tag: s.tag, id: s.id })) }),
      });
      if (!res.ok) {
        if (await showBetaLimitToast(res)) return;
        toast.error(res.status === 429 ? "Too many requests — try again in a minute." : "Source check failed. Please try again.");
        return;
      }
      setChecks(((await res.json()) as { checks: CitationCheck[] }).checks);
    } catch {
      toast.error("Connection failed.");
    } finally {
      setChecking(false);
    }
  }

  const counts = checks?.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});

  return (
    <div className="mt-4 space-y-3 border-t border-border/50 pt-3">
      {sources.length > 0 && citedStatements > 0 && (
        <div data-testid="documents-source-check">
          {!checks ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={checkSources} disabled={checking} data-testid="documents-check-sources">
                {checking ? "Checking each statement…" : "✓ Check sources"}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                An AI re-reads each cited line against its source ({citedStatements} to check · uses 1 AI reply).
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium" data-testid="documents-source-check-summary">
                Source check: <span className="text-success">{counts?.supported ?? 0} supported</span>
                {" · "}
                <span className="text-warning">{counts?.partial ?? 0} partly</span>
                {" · "}
                <span className="text-destructive">{(counts?.unsupported ?? 0) + (counts?.missing ?? 0)} not found</span>
              </p>
              <ul className="space-y-1.5">
                {checks.map((c, i) => {
                  const s = STATUS[c.status];
                  return (
                    <li key={i} className="flex min-w-0 items-start gap-2 text-xs" data-testid="documents-source-check-item">
                      <span className={`mt-px w-3 shrink-0 text-center font-bold ${s.tone}`} aria-hidden>{s.icon}</span>
                      <span className="min-w-0">
                        <span className="text-foreground/90">{c.claim}</span>{" "}
                        <span className="text-muted-foreground">[{c.tags.join(", ")}]</span>
                        <span className={`block ${s.tone}`}>
                          {s.label}
                          {c.note ? <span className="text-muted-foreground"> — {c.note}</span> : null}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[10px] text-muted-foreground">
                Checked by AI — a quick second opinion, not a guarantee. Click a source chip to read the passage yourself.
              </p>
            </div>
          )}
        </div>
      )}

      {trace && <AnswerTraceView trace={trace} />}
    </div>
  );
}

function AnswerTraceView({ trace }: { trace: AnswerTrace }) {
  const totalChunks = trace.documents.reduce((n, d) => n + d.chunks, 0);
  const files = trace.documents.map((d) => d.fileName).join(", ") || "your file";
  const local = trace.embedModel.startsWith("ollama/");
  const summarize = trace.mode === "summarize";

  const atUpload = [
    { title: "Read the file", text: `Text was pulled out of ${files}, keeping where each part came from (page, slide, sheet row).` },
    { title: "Hide secrets", text: "API keys, tokens and passwords were blanked out before anything was saved." },
    { title: "Cut into passages", text: `The text was split into ${plural(totalChunks, "short passage")} so the AI can quote exact parts.` },
    { title: "Turn passages into numbers", text: `Each passage became a list of 768 numbers (an "embedding") with ${trace.embedModel}${local ? ", on this computer" : ""}. Passages that mean similar things get similar numbers.` },
    { title: "Store privately", text: "The passages and their numbers were saved in your private search index — only your account can search it." },
  ];
  const atQuestion = [
    summarize
      ? { title: "Skip the search", text: "For a summary there's nothing to search for, so the opening passages were taken in reading order." }
      : { title: "Understand the question", text: "Your question was turned into the same kind of 768 numbers." },
    summarize
      ? { title: "Pick the passages", text: `The opening ${plural(trace.passagesUsed, "passage")} ${trace.passagesUsed === 1 ? "was" : "were"} picked (${trace.timingsMs.search} ms).` }
      : {
          title: "Find the closest passages",
          text: `The ${plural(trace.passagesUsed, "passage")} closest in meaning to the question ${trace.passagesUsed === 1 ? "was" : "were"} picked${trace.topSimilarity !== null ? ` (best match similarity ${trace.topSimilarity.toFixed(2)} out of 1)` : ""} in ${trace.timingsMs.search} ms.`,
        },
    { title: "Hand them to the AI", text: `${trace.contextChars.toLocaleString("en-IN")} characters were given to the AI, labelled S1, S2… and marked as data — text inside a file can't give the AI orders.` },
    { title: "Write the cited answer", text: `${PROVIDER_NAMES[trace.answerProvider] ?? trace.answerProvider} wrote the answer only from those passages, tagging each fact with its source, in ${(trace.timingsMs.answer / 1000).toFixed(1)} s.` },
  ];

  return (
    <details className="group rounded-lg border border-border/60 bg-background/30 px-3 py-2" data-testid="documents-answer-trace">
      <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden>▸</span>
        How this answer was made · 9 steps
      </summary>
      <div className="mt-3 space-y-3">
        <TraceGroup label="When you uploaded the file" steps={atUpload} start={1} />
        <TraceGroup label="When you asked" steps={atQuestion} start={6} />
      </div>
    </details>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function TraceGroup({ label, steps, start }: { label: string; steps: { title: string; text: string }[]; start: number }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">{label}</p>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-2.5">
            <span className="brand-gradient mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" aria-hidden>
              {start + i}
            </span>
            <span className="min-w-0 text-xs leading-relaxed">
              <span className="font-medium">{s.title}.</span>{" "}
              <span className="text-muted-foreground">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
