"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChatMessage } from "@/components/workspace/chat-message";
import { ChatInput } from "@/components/workspace/chat-input";
import { ThinkingOrb } from "@/components/workspace/thinking-orb";
import { ChunkViewer } from "@/components/documents/chunk-viewer";
import { Button } from "@/components/ui/button";
import {
  useSpeechSynthesis,
  stripMarkdownForSpeech,
} from "@/lib/voice/useSpeechSynthesis";
import type { VoiceLang } from "@/lib/voice/useSpeechRecognition";
import { SOURCES_FRAME_PREFIX } from "@/lib/utils";
import {
  AI_BUSY_MESSAGE,
  AI_BUSY_TITLE,
  BETA_ERROR_MESSAGES,
  BETA_LIMITS,
  BETA_USAGE_EVENT,
  betaErrorMessage,
  isOpenBeta,
} from "@/lib/beta/config";
import type { ChatMessageRecord } from "@/types/chat";
import type { RetrievedSource } from "@/types/documents";

// Soft wellness suggestion: clear distress phrases only. Never auto-enables,
// never nags after dismissal (remembered for the browser session). This stays
// a link to /talk — no wellness code is imported here (isolation rule).
const DISTRESS_PATTERN =
  /i'?m (?:so )?(?:stressed|anxious|depressed|overwhelmed|exhausted|burn(?:ed|t) out)|feel(?:ing)? (?:low|down|empty|hopeless|alone|lonely)|need someone to talk|bahut (?:pareshan|tension|stress|akela)|mann nahi lag|thak (?:gaya|gayi) hoon/i;
const WELLNESS_SUGGEST_DISMISSED_KEY = "wellness-suggest-dismissed";

// Suggestion chips from the design source
const SUGGESTED_PROMPTS = [
  { icon: "✨", text: "Draft a launch announcement for our new app" },
  { icon: "💡", text: "Brainstorm 10 names for a productivity tool" },
  { icon: "📋", text: "Summarize a long report into 5 key points" },
  { icon: "💻", text: "Explain this code and suggest improvements" },
];

type UiMessage = Pick<ChatMessageRecord, "id" | "role" | "content"> & {
  sources?: RetrievedSource[];
};

export function ChatPanel({
  conversationId,
  initialMessages,
  projectId = null,
  basePath = "/chat",
  header,
  emptyState,
}: {
  conversationId: string | null;
  initialMessages: ChatMessageRecord[];
  /** Set for chats inside a project — new conversations are created in it. */
  projectId?: string | null;
  /** Where a new conversation navigates after its first reply. */
  basePath?: string;
  /** Optional bar above the thread (e.g. the project context bar). */
  header?: ReactNode;
  /** Optional replacement for the default empty-state hero. */
  emptyState?: ReactNode;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<UiMessage[]>(() =>
    initialMessages.map((m) => ({ ...m, sources: m.metadata?.sources ?? [] }))
  );
  const [modelId, setModelId] = useState("");
  const [activeSource, setActiveSource] = useState<RetrievedSource | null>(null);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [waitingFirstToken, setWaitingFirstToken] = useState(false);
  const [guestLimitHit, setGuestLimitHit] = useState(false);
  // A new chat whose first send hit "ai_busy": the server kept the empty chat
  // (it already used a chat slot), so the resend goes into it.
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
  const activeConversationId = conversationId ?? pendingConversationId;
  const [suggestWellness, setSuggestWellness] = useState(false);
  const [voiceLang, setVoiceLang] = useState<VoiceLang>("en-IN");
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const { speak, stop: stopSpeaking } = useSpeechSynthesis(voiceLang);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, waitingFirstToken]);

  // Abort in-flight stream if the user navigates away mid-generation.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text: string) {
    const message = text.trim();
    if (!message || streaming) return;
    stopSpeaking(); // new input cuts off any in-progress voice reply
    if (
      DISTRESS_PATTERN.test(message) &&
      sessionStorage.getItem(WELLNESS_SUGGEST_DISMISSED_KEY) !== "1"
    ) {
      setSuggestWellness(true);
    }
    setInput("");
    setStreaming(true);
    setWaitingFirstToken(true);
    const userMessageId = `local-user-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: "user", content: message },
    ]);
    // A rejected send (limit hit) shouldn't look delivered: drop the bubble
    // and give the text back so it can be sent somewhere else.
    const undoSend = () => {
      setMessages((prev) => prev.filter((m) => m.id !== userMessageId));
      setInput(message);
    };

    const controller = new AbortController();
    abortRef.current = controller;
    const assistantId = `local-assistant-${Date.now()}`;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          ...(activeConversationId ? { conversationId: activeConversationId } : {}),
          ...(!activeConversationId && projectId ? { projectId } : {}),
          ...(modelId ? { modelId } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        setStreaming(false);
        setWaitingFirstToken(false);
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (data.error === "guest_conversation_limit") {
          setGuestLimitHit(true);
          return;
        }
        if (data.error === "ai_busy") {
          const keptId = res.headers.get("X-Conversation-Id");
          if (keptId) setPendingConversationId(keptId);
          undoSend();
          toast.warning(AI_BUSY_TITLE, { description: AI_BUSY_MESSAGE, duration: 10000 });
          return;
        }
        const betaMessage = betaErrorMessage(data.error);
        if (betaMessage) {
          undoSend();
          toast.warning("Beta limit", { description: betaMessage, duration: 8000 });
          return;
        }
        if (res.status === 429) {
          undoSend();
          const seconds = Math.max(1, Math.ceil((data.retryAfterMs ?? 60000) / 1000));
          toast.warning("Whoa, you're fast!", {
            description: `Give it a breather — try again in ${seconds}s.`,
          });
          return;
        }
        toast.error("Something went wrong. Please try again.");
        return;
      }

      const newConversationId = res.headers.get("X-Conversation-Id");
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullReply = "";
      // Project chats prefix one sources frame (see SOURCES_FRAME_PREFIX).
      let head = "";
      let headDone = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        let delta = decoder.decode(value, { stream: true });
        if (!headDone) {
          head += delta;
          if (head.startsWith(SOURCES_FRAME_PREFIX)) {
            const newline = head.indexOf("\n");
            if (newline === -1) continue; // frame not complete yet
            try {
              const sources = JSON.parse(head.slice(SOURCES_FRAME_PREFIX.length, newline)) as RetrievedSource[];
              setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, sources } : m)));
            } catch {
              // malformed frame — show the reply without chips
            }
            delta = head.slice(newline + 1);
          } else if (head.length < SOURCES_FRAME_PREFIX.length && SOURCES_FRAME_PREFIX.startsWith(head)) {
            continue; // could still be a frame prefix
          } else {
            delta = head;
          }
          headDone = true;
          if (!delta) continue;
        }
        fullReply += delta;
        setWaitingFirstToken(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + delta } : m
          )
        );
      }

      // Voice reply: speak after streaming completes (markdown stripped).
      if (ttsEnabled && fullReply) {
        speak(stripMarkdownForSpeech(fullReply));
      }

      // New conversation: move to its URL so refresh keeps the history.
      if (!conversationId && newConversationId) {
        router.push(`${basePath}/${newConversationId}`);
      }
      router.refresh(); // reorder sidebar
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        toast.error("Connection lost mid-reply. Please try again.");
      }
      // Abort keeps whatever partial text already rendered.
    } finally {
      setStreaming(false);
      setWaitingFirstToken(false);
      abortRef.current = null;
      window.dispatchEvent(new Event(BETA_USAGE_EVENT)); // refresh the beta banner
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  const isEmpty = messages.length === 0 && !streaming;

  return (
    <div className="flex h-full flex-col">
      {header}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {isEmpty && emptyState ? (
            emptyState
          ) : isEmpty ? (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-8 text-center">
              <div className="flex flex-col items-center duration-500 ease-out animate-in fade-in zoom-in-95 motion-reduce:animate-none">
                {/* Design-source orb: glow + orbit ring + 2 orbiting dots + breathing star core */}
                <div className="relative mb-6 h-36 w-36">
                  <span
                    className="brand-gradient absolute -inset-[8%] rounded-full opacity-40 blur-[38px]"
                    style={{ animation: "anv-breathe 4s ease-in-out infinite" }}
                  />
                  <span
                    className="absolute inset-[22%] rounded-full border border-border"
                    style={{ animation: "anv-orbit 9s linear infinite" }}
                  />
                  <span className="absolute inset-0" style={{ animation: "anv-orbit 7s linear infinite" }}>
                    <span className="absolute -top-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary shadow-glow-primary" />
                  </span>
                  <span className="absolute inset-[11%]" style={{ animation: "anv-orbit-r 5.5s linear infinite" }}>
                    <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent shadow-glow-accent" />
                  </span>
                  <span
                    className="brand-gradient absolute inset-[33%] grid place-items-center rounded-full"
                    style={{
                      animation: "anv-breathe 4s ease-in-out infinite",
                      boxShadow: "inset 0 0 22px rgba(255,255,255,.45)",
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="#fff" className="h-[54%] w-[54%]">
                      <path d="M12 1l2.2 8L22 12l-7.8 2.9L12 23l-2.2-8.1L2 12l7.8-2.9z" />
                    </svg>
                  </span>
                </div>
                <h1 className="font-display text-5xl font-bold leading-none tracking-[-2px]">
                  Abhi<span className="text-primary">Nova</span> AI
                </h1>
                <p className="mb-7 mt-3 text-base text-muted-foreground">
                  How can I accelerate your work today?
                </p>
              </div>
              <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <button
                    key={prompt.text}
                    type="button"
                    onClick={() => send(prompt.text)}
                    style={{ animationDelay: `${150 + i * 70}ms` }}
                    className="glass flex items-center gap-3 rounded-[15px] px-4 py-[15px] text-left text-[13.5px] font-medium leading-snug transition-all fill-mode-both animate-in fade-in slide-in-from-bottom-2 hover:-translate-y-0.5 hover:border-primary/40 motion-reduce:animate-none"
                    data-testid={`chat-empty-chip-${i}`}
                  >
                    <span className="text-xl text-primary">{prompt.icon}</span>
                    {prompt.text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m) => (
                <ChatMessage
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  sources={m.sources}
                  onCitationClick={setActiveSource}
                  streaming={
                    streaming &&
                    !waitingFirstToken &&
                    m.id === messages[messages.length - 1]?.id &&
                    m.role === "assistant"
                  }
                />
              ))}
              {waitingFirstToken && <ThinkingOrb />}
            </>
          )}
          {guestLimitHit && (
            <div
              className="glass mx-auto w-full max-w-md rounded-lg p-5 text-center"
              data-testid="chat-guest-limit-panel"
            >
              <p className="text-sm font-medium">
                This chat is full.
              </p>
              {isOpenBeta() ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {BETA_ERROR_MESSAGES.guest_conversation_limit} Start a new chat from the sidebar — free testers get{" "}
                  {BETA_LIMITS.chats} chats.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Create a free account to keep going — your chats come with you.
                  </p>
                  <Button asChild size="sm" className="mt-4" data-testid="chat-guest-limit-cta">
                    <Link href="/signup">Create a free account</Link>
                  </Button>
                </>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="border-t border-border/60 px-4 py-3">
        <div className="mx-auto max-w-3xl">
          {suggestWellness && (
            <div
              className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/40 px-3 py-2"
              data-testid="chat-wellness-suggestion"
            >
              <p className="text-xs text-muted-foreground">
                🌿 Wellness Mode is available if you&apos;d like a calmer space.
              </p>
              <div className="flex shrink-0 gap-2">
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  data-testid="chat-wellness-suggestion-enable"
                >
                  <Link href="/talk">Open</Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    sessionStorage.setItem(WELLNESS_SUGGEST_DISMISSED_KEY, "1");
                    setSuggestWellness(false);
                  }}
                  data-testid="chat-wellness-suggestion-dismiss"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          )}
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={() => send(input)}
            onStop={stop}
            streaming={streaming}
            disabled={guestLimitHit}
            voiceLang={voiceLang}
            onVoiceLangChange={setVoiceLang}
            modelId={modelId}
            onModelChange={setModelId}
            ttsEnabled={ttsEnabled}
            onTtsChange={(enabled) => {
              setTtsEnabled(enabled);
              if (!enabled) stopSpeaking();
            }}
          />
        </div>
      </div>
      {activeSource && (
        <ChunkViewer source={activeSource} onClose={() => setActiveSource(null)} />
      )}
    </div>
  );
}
