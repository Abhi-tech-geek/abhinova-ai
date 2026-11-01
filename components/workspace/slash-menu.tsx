"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { openCommandPalette } from "@/components/shared/command-palette";
import { openMemoryDialog, openSavedPrompts, PROMPTS_CHANGED_EVENT } from "@/components/workspace/account-dialogs";
import type { SavedPromptRecord } from "@/types/chat";

// "/" commands in the chat box: quick actions + your saved prompts.
// Type "/" → menu; ↑/↓ to move, Enter/Tab to pick, Esc to close.

interface SlashItem {
  key: string;
  label: string;
  hint: string;
  /** Returns true when the command consumed the input. */
  run: (rest: string) => void | Promise<void>;
}

export function useSlashMenu({
  value,
  setValue,
  agentMode,
  onAgentModeChange,
}: {
  value: string;
  setValue: (v: string) => void;
  agentMode: boolean;
  onAgentModeChange: (on: boolean) => void;
}) {
  const router = useRouter();
  const [prompts, setPrompts] = useState<SavedPromptRecord[] | null>(null);
  const [active, setActive] = useState(0);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const typing = value.startsWith("/") && !value.includes("\n");
  const [word, ...restParts] = typing ? value.slice(1).split(" ") : [""];
  const rest = restParts.join(" ").trim();

  const loadPrompts = useCallback(() => {
    fetch("/api/prompts")
      .then((res) => (res.ok ? res.json() : { prompts: [] }))
      .then((data: { prompts?: SavedPromptRecord[] }) => setPrompts(data.prompts ?? []))
      .catch(() => setPrompts([]));
  }, []);

  // Saved prompts load the first time the menu opens, and again when edited.
  useEffect(() => {
    if (typing && prompts === null) loadPrompts();
  }, [typing, prompts, loadPrompts]);
  useEffect(() => {
    window.addEventListener(PROMPTS_CHANGED_EVENT, loadPrompts);
    return () => window.removeEventListener(PROMPTS_CHANGED_EVENT, loadPrompts);
  }, [loadPrompts]);

  const commands: SlashItem[] = [
    {
      key: "agent",
      label: agentMode ? "⚡ Turn Agent Mode off" : "⚡ Turn Agent Mode on",
      hint: "Let AbhiNova search Wikipedia, read pages and your files first",
      run: () => {
        onAgentModeChange(!agentMode);
        setValue("");
        toast.info(agentMode ? "Agent Mode off" : "Agent Mode on");
      },
    },
    {
      key: "remember",
      label: "🧠 /remember …",
      hint: "Save a fact about you to Memory (e.g. /remember I'm a QA engineer)",
      run: async (text) => {
        if (!text) {
          setValue("/remember ");
          return;
        }
        const res = await fetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text.slice(0, 300), enable: true }),
        }).catch(() => null);
        if (!res?.ok) {
          toast.error(res?.status === 409 ? "Memory is full — remove something first." : "Couldn't save to Memory.");
          return;
        }
        setValue("");
        toast.success("Saved to Memory", {
          description: "Memory is on — AbhiNova will use this in your chats.",
          action: { label: "Manage", onClick: openMemoryDialog },
        });
      },
    },
    { key: "memory", label: "🧠 Memory", hint: "See or delete what AbhiNova remembers", run: () => { setValue(""); openMemoryDialog(); } },
    { key: "prompts", label: "📌 Saved prompts", hint: "Add or remove your reusable prompts", run: () => { setValue(""); openSavedPrompts(); } },
    { key: "testcases", label: "🧭 Requirements → Tests", hint: "Test cases traced to each requirement + coverage", run: () => router.push("/qa-studio/requirement-coverage") },
    { key: "bug", label: "📸 Bug report from a screenshot", hint: "Paste a screenshot, get a ready bug report", run: () => router.push("/qa-studio/bug-report") },
    { key: "docs", label: "📄 Ask your documents", hint: "Cited answers you can source-check", run: () => router.push("/documents") },
    { key: "search", label: "🔎 Search your chats", hint: "Find an old chat by its words", run: () => { setValue(""); openCommandPalette(); } },
  ];
  const promptItems: SlashItem[] = (prompts ?? []).map((p) => ({
    key: `p:${p.title.toLowerCase()}`,
    label: `📌 ${p.title}`,
    hint: p.content.slice(0, 80),
    run: () => setValue(p.content),
  }));

  const q = word.toLowerCase();
  const items = [...commands, ...promptItems].filter(
    (it) => !q || it.key.includes(q) || it.label.toLowerCase().includes(q)
  );
  // Once a command word is followed by text ("/remember …"), only that command applies.
  const exact = rest ? commands.filter((c) => c.key === q) : null;
  const visible = exact ?? items;
  const open = typing && dismissedFor !== value && visible.length > 0;
  const activeIndex = Math.min(active, Math.max(0, visible.length - 1));

  function pick(i: number) {
    const item = visible[i];
    if (!item) return;
    setActive(0);
    void item.run(rest);
  }

  /** Call from the textarea's onKeyDown; returns true when the key was handled. */
  function onKeyDown(e: React.KeyboardEvent): boolean {
    if (!open) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + visible.length) % visible.length);
      return true;
    }
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
      e.preventDefault();
      pick(activeIndex);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setDismissedFor(value);
      return true;
    }
    return false;
  }

  const menu = open ? (
    <div
      className="absolute bottom-full left-0 right-0 z-30 mb-2 max-h-72 overflow-y-auto rounded-[16px] border border-border bg-card p-1.5 shadow-glass"
      role="listbox"
      aria-label="Commands"
      data-testid="chat-input-slash-menu"
    >
      {visible.map((it, i) => (
        <button
          key={it.key}
          type="button"
          role="option"
          aria-selected={i === activeIndex}
          onMouseDown={(e) => e.preventDefault()} // keep focus in the textarea
          onClick={() => pick(i)}
          onMouseEnter={() => setActive(i)}
          className={`flex w-full min-w-0 flex-col rounded-[10px] px-3 py-2 text-left ${i === activeIndex ? "bg-primary/15" : ""}`}
          data-testid="chat-input-slash-item"
        >
          <span className="truncate text-sm font-medium">{it.label}</span>
          <span className="truncate text-xs text-muted-foreground">{it.hint}</span>
        </button>
      ))}
    </div>
  ) : null;

  return { open, menu, onKeyDown };
}
