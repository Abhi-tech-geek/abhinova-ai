"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PersonaPicker } from "@/components/wellness/persona-picker";
import { CrisisCard } from "@/components/wellness/crisis-card";
import { SessionSummary } from "@/components/wellness/session-summary";
import type { Persona, WellnessMessage } from "@/types/wellness";
import { LocalTime } from "@/components/shared/local-time";
import { showBetaLimitToast } from "@/lib/beta/client";

const CRISIS_SESSION_KEY = "wellness-crisis-active";
const PERSONA_KEY = "wellness-persona";

export interface PastWellnessSession {
  id: string;
  summary: string;
  updatedAt: string;
}

export function TalkPanel({
  initialConversationId,
  initialMessages,
  pastSessions = [],
}: {
  initialConversationId: string | null;
  initialMessages: WellnessMessage[];
  pastSessions?: PastWellnessSession[];
}) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [messages, setMessages] = useState<WellnessMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [persona, setPersona] = useState<Persona>("dost");
  const [streaming, setStreaming] = useState(false);
  const [crisisActive, setCrisisActive] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Crisis card persists for the whole browser session once shown.
    setCrisisActive(sessionStorage.getItem(CRISIS_SESSION_KEY) === "1");
    const savedPersona = localStorage.getItem(PERSONA_KEY);
    if (savedPersona && ["dost", "sage", "coach", "socrates"].includes(savedPersona)) {
      setPersona(savedPersona as Persona);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function changePersona(next: Persona) {
    setPersona(next);
    localStorage.setItem(PERSONA_KEY, next);
  }

  async function send() {
    const message = input.trim();
    if (!message || streaming) return;
    setInput("");
    setStreaming(true);
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", content: message },
    ]);
    const assistantId = `a-${Date.now()}`;

    try {
      const res = await fetch("/api/wellness/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          message,
          persona,
          ...(conversationId ? { conversationId } : {}),
        }),
      });

      if (!res.ok) {
        setStreaming(false);
        if (await showBetaLimitToast(res)) return;
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.status === 429) {
          toast.warning("Ek chhota sa break — try again in a minute.");
          return;
        }
        toast.error("Something went wrong. I'm still here — try again.");
        return;
      }

      if (res.headers.get("X-Crisis") === "1") {
        sessionStorage.setItem(CRISIS_SESSION_KEY, "1");
        setCrisisActive(true);
      }
      const newId = res.headers.get("X-Conversation-Id");
      if (newId && !conversationId) setConversationId(newId);

      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const delta = decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + delta } : m
          )
        );
      }
    } catch {
      toast.error("Connection dropped. Take a breath — and try again.");
    } finally {
      setStreaming(false);
    }
  }

  async function endSession() {
    if (!conversationId || ending) return;
    setEnding(true);
    try {
      const res = await fetch("/api/wellness/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end", conversationId }),
      });
      if (!res.ok) {
        if (await showBetaLimitToast(res)) return;
        toast.error("Couldn't create the summary right now.");
        return;
      }
      const data = await res.json();
      setSummary(data.summary);
      // Fresh session next message; the summarized one stays in history.
      setConversationId(null);
      setMessages([]);
    } catch {
      toast.error("Couldn't create the summary right now.");
    } finally {
      setEnding(false);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-4 px-5 py-6">
      <div className="flex items-start gap-3">
        <span className="brand-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg text-white">
          🧘
        </span>
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">
            A calmer space
          </h1>
          <p className="text-xs text-muted-foreground">
            Take a breath. I&apos;m here whenever you&apos;re ready.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <PersonaPicker persona={persona} onChange={changePersona} disabled={streaming} />
        {messages.length > 0 && conversationId && (
          <Button
            size="sm"
            variant="outline"
            onClick={endSession}
            disabled={ending || streaming}
            data-testid="wellness-end-session"
          >
            {ending ? "Wrapping up…" : "End session"}
          </Button>
        )}
      </div>

      {pastSessions.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1" data-testid="wellness-past-sessions">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            Sessions
          </span>
          {pastSessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSummary(s.summary)}
              className="glass shrink-0 rounded-full px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              title="View session summary"
              data-testid="wellness-past-session-chip"
            >
              🌿 <LocalTime iso={s.updatedAt} format="short" />
            </button>
          ))}
        </div>
      )}

      {crisisActive && <CrisisCard />}

      <div className="flex-1 space-y-3 overflow-y-auto py-2">
        {messages.length === 0 && !streaming && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-primary/10 animate-pulse-glow" />
              <span className="brand-gradient relative flex h-11 w-11 items-center justify-center rounded-full text-lg text-white">
                ✦
              </span>
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">
              Ye ek shaant jagah hai. Jo bhi mann mein hai — share karo, main sun
              raha hoon.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            data-testid={`wellness-message-${m.role}`}
          >
            <div
              className={
                m.role === "user"
                  ? "brand-gradient max-w-[80%] rounded-2xl px-4 py-2.5 text-sm text-white"
                  : "glass max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
              }
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          </motion.div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="glass rounded-2xl p-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, 8000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Jo mann mein hai, likh do…"
          rows={2}
          className="resize-none border-0 bg-transparent focus-visible:ring-0"
          data-testid="wellness-talk-input"
        />
        <div className="flex justify-end px-1 pt-1">
          <Button
            size="sm"
            onClick={send}
            disabled={streaming || !input.trim()}
            className="rounded-full shadow-glow-primary"
            data-testid="wellness-talk-send"
          >
            {streaming ? "…" : "Share"}
          </Button>
        </div>
      </div>

      <SessionSummary summary={summary} onClose={() => setSummary(null)} />
    </div>
  );
}
