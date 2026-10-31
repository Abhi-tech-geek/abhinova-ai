"use client";

import { motion } from "framer-motion";
import { BrandStar } from "@/components/shared/logo";
import ChatMarkdown from "@/components/workspace/chat-markdown";
import type { AgentStep, ChatRole } from "@/types/chat";
import type { RetrievedSource } from "@/types/documents";

export function ChatMessage({
  role,
  content,
  streaming = false,
  sources = [],
  steps = [],
  onCitationClick,
}: {
  role: ChatRole;
  content: string;
  streaming?: boolean;
  sources?: RetrievedSource[];
  /** Agent Mode: the tools used before this reply. */
  steps?: AgentStep[];
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
        {steps.length > 0 && (
          <ul
            className="mb-2 space-y-1 rounded-[12px] border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground"
            aria-label="Agent steps"
            data-testid="chat-message-agent-steps"
          >
            {steps.map((step, i) => (
              <li key={i} className="flex min-w-0 items-start gap-1.5">
                <span aria-hidden className={step.ok ? "text-success" : "text-warning"}>
                  {step.ok ? "✓" : "⚠"}
                </span>
                <span className="min-w-0 break-words">{step.label}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="prose-chat space-y-2 [&_a]:text-accent [&_a]:underline [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:text-xs [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:pl-5">
            <ChatMarkdown content={content} sources={sources} onCitationClick={onCitationClick} />
            {streaming && (
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary align-text-bottom" />
            )}
        </div>
      </div>
    </motion.div>
  );
}
