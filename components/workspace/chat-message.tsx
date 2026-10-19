"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BrandStar } from "@/components/shared/logo";
import { CitationChip } from "@/components/documents/citation-chip";
import type { ChatRole } from "@/types/chat";
import type { RetrievedSource } from "@/types/documents";

function CodeBlock({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group relative my-2">
      <pre className="overflow-x-auto rounded-md border border-border bg-background/60 p-3 font-mono text-xs leading-relaxed">
        <code className={className}>{text}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 rounded-md border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        data-testid="chat-codeblock-copy"
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

// react-markdown with remark-gfm renders to React elements only — no raw HTML
// pass-through, so AI output can't inject markup (safe renderer per CLAUDE.md).
// [S1] / 【S1】 → a markdown link to #cite-S1, rendered as a citation chip
// (only for tags that actually exist in this reply's sources).
function linkCitations(content: string, sources: RetrievedSource[]): string {
  if (sources.length === 0) return content;
  const tags = new Set(sources.map((s) => s.tag));
  return content.replace(/[[【](S\d+)[\]】]/g, (match, tag: string) =>
    tags.has(tag) ? `[${tag}](#cite-${tag})` : match
  );
}

export function ChatMessage({
  role,
  content,
  streaming = false,
  sources = [],
  onCitationClick,
}: {
  role: ChatRole;
  content: string;
  streaming?: boolean;
  sources?: RetrievedSource[];
  onCitationClick?: (source: RetrievedSource) => void;
}) {
  const isUser = role === "user";

  // Design source: user = gradient bubble with a tail corner; AI = no bubble —
  // a gradient star avatar + "AbhiNova" label + plain text.
  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="flex justify-end"
        data-testid="chat-message-user"
      >
        <div className="brand-gradient max-w-[78%] rounded-[18px] rounded-br-[5px] px-4 py-3 text-sm leading-relaxed text-white shadow-glow-primary">
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex gap-3"
      data-testid="chat-message-assistant"
    >
      <span className="brand-gradient mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] shadow-glow-primary">
        <BrandStar className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5 text-sm">
        <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
          AbhiNova
        </p>
        <div className="prose-chat space-y-2 [&_a]:text-accent [&_a]:underline [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:text-xs [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                pre: ({ children }) => <>{children}</>,
                code: ({ className, children }) => {
                  const text = String(children).replace(/\n$/, "");
                  const isBlock =
                    (className ?? "").includes("language-") || text.includes("\n");
                  if (!isBlock) {
                    return (
                      <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">
                        {text}
                      </code>
                    );
                  }
                  return <CodeBlock text={text} className={className} />;
                },
                a: ({ href, children }) => {
                  const tag = href?.startsWith("#cite-") ? href.slice(6) : null;
                  const source = tag ? sources.find((s) => s.tag === tag) : undefined;
                  if (source && onCitationClick) {
                    return <CitationChip source={source} onClick={onCitationClick} />;
                  }
                  return (
                    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                      {children}
                    </a>
                  );
                },
              }}
            >
              {linkCitations(content, sources)}
            </ReactMarkdown>
            {streaming && (
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary align-text-bottom" />
            )}
        </div>
      </div>
    </motion.div>
  );
}
