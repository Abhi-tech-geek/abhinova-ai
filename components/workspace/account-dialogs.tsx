"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Memory + Saved prompts dialogs. Opened from the account menu or the chat's
// "/" commands via window events; each dialog's code loads on first open.

const MemoryDialog = dynamic(() => import("@/components/workspace/memory-dialog"));
const SavedPromptsDialog = dynamic(() => import("@/components/workspace/saved-prompts-dialog"));

const OPEN_MEMORY_EVENT = "anv:open-memory";
const OPEN_PROMPTS_EVENT = "anv:open-saved-prompts";
/** Fired when saved prompts change, so the "/" menu reloads them. */
export const PROMPTS_CHANGED_EVENT = "anv:saved-prompts-changed";

export const openMemoryDialog = () => window.dispatchEvent(new Event(OPEN_MEMORY_EVENT));
export const openSavedPrompts = () => window.dispatchEvent(new Event(OPEN_PROMPTS_EVENT));

export function AccountDialogs() {
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);

  useEffect(() => {
    const openMemory = () => setMemoryOpen(true);
    const openPrompts = () => setPromptsOpen(true);
    window.addEventListener(OPEN_MEMORY_EVENT, openMemory);
    window.addEventListener(OPEN_PROMPTS_EVENT, openPrompts);
    return () => {
      window.removeEventListener(OPEN_MEMORY_EVENT, openMemory);
      window.removeEventListener(OPEN_PROMPTS_EVENT, openPrompts);
    };
  }, []);

  return (
    <>
      {memoryOpen && <MemoryDialog open={memoryOpen} onOpenChange={setMemoryOpen} />}
      {promptsOpen && <SavedPromptsDialog open={promptsOpen} onOpenChange={setPromptsOpen} />}
    </>
  );
}
