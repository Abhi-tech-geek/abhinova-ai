"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DocumentPicker } from "@/components/documents/document-picker";
import { CitationChip } from "@/components/documents/citation-chip";
import { ChunkViewer } from "@/components/documents/chunk-viewer";
import { AnswerInsights } from "@/components/documents/answer-insights";
import type { AnswerTrace, DocumentRecord, RetrievedSource } from "@/types/documents";
import { showBetaLimitToast } from "@/lib/beta/client";

// "Ask your documents" — pick one or more files, ask, get a cited answer.
// [S1]-style tags in the answer render as clickable citation chips.
export function DocChat({ documents }: { documents: DocumentRecord[] }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    answer: string;
    sources: RetrievedSource[];
    trace?: AnswerTrace;
  } | null>(null);
  const [activeSource, setActiveSource] = useState<RetrievedSource | null>(null);

  async function ask() {
    if (!question.trim() || selectedIds.length === 0 || loading) return;
    setLoading(true);
    setResult(null);
    setActiveSource(null);
    try {
      const res = await fetch("/api/documents/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          documentIds: selectedIds,
          mode: "ask",
        }),
      });
      if (!res.ok) {
        if (await showBetaLimitToast(res)) return;
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.status === 429) {
          const data = await res.json().catch(() => ({ retryAfterMs: 60000 }));
          const seconds = Math.max(1, Math.ceil((data.retryAfterMs ?? 60000) / 1000));
          toast.warning("Rate limit reached", { description: `Try again in ${seconds}s.` });
          return;
        }
        toast.error("Question failed. Please try again.");
        return;
      }
      setResult(await res.json());
    } catch {
      toast.error("Connection failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4" data-testid="documents-docchat">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Ask your documents
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Select one or more files — answers cite their sources. Pick two files
          and ask “compare these” for a cross-document comparison.
        </p>
      </div>

      <DocumentPicker
        documents={documents}
        selectedIds={selectedIds}
        onChange={setSelectedIds}
      />

      <div className="glass rounded-lg p-2">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, 4000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask();
            }
          }}
          placeholder={
            selectedIds.length === 0
              ? "Select documents above first…"
              : "Ask a question about the selected documents…"
          }
          rows={2}
          className="resize-none border-0 bg-transparent focus-visible:ring-0"
          data-testid="documents-question-input"
        />
        <div className="flex justify-end px-1 pt-1">
          <Button
            size="sm"
            onClick={ask}
            disabled={loading || !question.trim() || selectedIds.length === 0}
            className="shadow-glow-primary"
            data-testid="documents-question-ask"
          >
            {loading ? "Searching…" : "Ask"}
          </Button>
        </div>
      </div>

      {loading && (
        <div className="glass flex items-center gap-3 rounded-lg p-4">
          <span className="h-3 w-3 animate-pulse-glow rounded-full bg-primary" />
          <span className="text-xs text-muted-foreground">
            Embedding question, retrieving chunks, composing answer…
          </span>
        </div>
      )}

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-lg p-5"
          data-testid="documents-answer"
        >
          <AnswerWithCitations
            answer={result.answer}
            sources={result.sources}
            onCitationClick={setActiveSource}
          />
          {result.sources.length > 0 && (
            <div className="mt-4 border-t border-border/50 pt-3" data-testid="documents-answer-sources">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Sources
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.sources.map((s) => (
                  <CitationChip key={s.tag} source={s} onClick={setActiveSource} />
                ))}
              </div>
            </div>
          )}
          <AnswerInsights key={result.answer} answer={result.answer} sources={result.sources} trace={result.trace} />
        </motion.div>
      )}

      {activeSource && (
        <ChunkViewer source={activeSource} onClose={() => setActiveSource(null)} />
      )}
    </section>
  );
}

// Splits the answer on [S1]/[S2][S3]-style tags and renders chips inline.
function AnswerWithCitations({
  answer,
  sources,
  onCitationClick,
}: {
  answer: string;
  sources: RetrievedSource[];
  onCitationClick: (source: RetrievedSource) => void;
}) {
  const bySources = new Map(sources.map((s) => [s.tag, s]));
  // gpt-oss models write citations as 【S1】 instead of [S1] — accept both.
  const parts = answer.split(/[[【](S\d+)[\]】]/g);

  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((part, i) => {
        const source = bySources.get(part);
        if (i % 2 === 1) {
          // Odd indexes are the captured tags; unknown tags render as text.
          return source ? (
            <CitationChip key={i} source={source} onClick={onCitationClick} />
          ) : (
            <span key={i}>[{part}]</span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}
