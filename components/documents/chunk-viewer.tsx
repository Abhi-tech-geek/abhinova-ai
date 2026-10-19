"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { citationLabel } from "@/components/documents/citation-chip";
import type { RetrievedSource } from "@/types/documents";

// Side panel showing the exact chunk text behind a clicked citation.
export function ChunkViewer({
  source,
  onClose,
}: {
  source: RetrievedSource;
  onClose: () => void;
}) {
  return (
    <motion.aside
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="glass fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border/60 p-5 shadow-glass"
      data-testid="documents-chunk-viewer"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-accent">{source.tag}</p>
          <h3 className="mt-0.5 text-sm font-medium">{citationLabel(source)}</h3>
          {source.similarity !== null && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              relevance: {(source.similarity * 100).toFixed(0)}%
            </p>
          )}
          {source.sourceUrl && /^https?:\/\//.test(source.sourceUrl) && (
            <a
              href={source.sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="mt-1 inline-block text-[11px] text-primary underline-offset-4 hover:underline"
              data-testid="documents-chunk-viewer-open-source"
            >
              Open original ↗
            </a>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} data-testid="documents-chunk-viewer-close">
          ✕
        </Button>
      </div>
      <div className="mt-4 flex-1 overflow-y-auto rounded-md border border-border/50 bg-background/40 p-4">
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {source.content}
        </p>
      </div>
    </motion.aside>
  );
}
