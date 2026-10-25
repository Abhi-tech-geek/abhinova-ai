"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CitationChip } from "@/components/documents/citation-chip";
import type { RetrievedSource } from "@/types/documents";

// The markdown renderer for AI replies. Imported statically on purpose: a
// next/dynamic boundary here made saved chats wait on a Suspense reveal
// before their replies appeared.

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
// [S1] / 【S1】 / [ S1 ] → a markdown link to #cite-S1, rendered as a citation
// chip (only for tags that actually exist in this reply's sources).
function linkCitations(content: string, sources: RetrievedSource[]): string {
  if (sources.length === 0) return content;
  const tags = new Set(sources.map((s) => s.tag));
  return content.replace(/[[【]\s*(S\d+)\s*[\]】]/g, (match, tag: string) =>
    tags.has(tag) ? `[${tag}](#cite-${tag})` : match
  );
}

export default function ChatMarkdown({
  content,
  sources,
  onCitationClick,
}: {
  content: string;
  sources: RetrievedSource[];
  onCitationClick?: (source: RetrievedSource) => void;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre: ({ children }) => <>{children}</>,
        // Wide tables scroll inside their own box; without it a long
        // URL or many columns made the whole chat list pan sideways.
        table: ({ children }) => (
          <div className="my-2 max-w-full overflow-x-auto" data-testid="chat-message-table">
            <table className="min-w-full border-collapse">{children}</table>
          </div>
        ),
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
        // Never auto-load images from AI replies: an injected document
        // could smuggle data out in an image URL (audit bug B2). Show a
        // link the user can choose to open instead.
        img: ({ src, alt }) => {
          const url = typeof src === "string" ? src : "";
          let host = "";
          try {
            host = new URL(url).hostname;
          } catch {
            host = "";
          }
          if (!host) return <span className="text-muted-foreground">[image]</span>;
          return (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs no-underline"
              data-testid="chat-message-image-link"
            >
              🖼 {alt ? `${alt} · ` : "Image · "}
              {host}
            </a>
          );
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
  );
}
