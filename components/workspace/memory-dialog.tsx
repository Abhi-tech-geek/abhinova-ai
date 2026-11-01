"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MemoryRecord } from "@/types/chat";

// Memory: facts AbhiNova should remember about you, used in chats only while
// the switch is on. Every fact is visible here and deletable.

const MAX_MEMORIES = 30;

export default function MemoryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/memory")
      .then(async (res) => {
        if (res.status === 503) return setUnavailable(true);
        if (!res.ok) throw new Error();
        const data: { enabled: boolean; memories: MemoryRecord[] } = await res.json();
        setEnabled(data.enabled);
        setMemories(data.memories);
      })
      .catch(() => toast.error("Couldn't load your memory."))
      .finally(() => setLoaded(true));
  }, []);

  async function toggle(on: boolean) {
    setEnabled(on);
    const res = await fetch("/api/memory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: on }),
    }).catch(() => null);
    if (!res?.ok) {
      setEnabled(!on);
      toast.error("Couldn't change that setting.");
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      toast.error(res?.status === 409 ? `Memory is full (${MAX_MEMORIES}). Delete something first.` : "Couldn't save that.");
      return;
    }
    const data: { memory: MemoryRecord } = await res.json();
    setMemories((prev) => [...prev, data.memory]);
    setDraft("");
  }

  async function remove(id: string) {
    const before = memories;
    setMemories((prev) => prev.filter((m) => m.id !== id));
    const res = await fetch(`/api/memory?id=${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setMemories(before);
      toast.error("Couldn't delete that.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-md" data-testid="memory-dialog">
        <DialogHeader>
          <DialogTitle>🧠 Memory</DialogTitle>
          <DialogDescription>
            Things AbhiNova remembers about you in every chat — your name, role, how you like answers. Only what you add
            here, and only while Memory is on.
          </DialogDescription>
        </DialogHeader>

        {unavailable ? (
          <p className="text-sm text-muted-foreground">Memory isn&apos;t switched on for this site yet.</p>
        ) : (
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
              <span className="text-sm font-medium">Use memory in chats</span>
              <Switch checked={enabled} onCheckedChange={toggle} disabled={!loaded} data-testid="memory-toggle" />
            </label>

            <form onSubmit={add} className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 300))}
                placeholder="e.g. I'm a QA engineer — reply in Hinglish"
                disabled={!loaded || memories.length >= MAX_MEMORIES}
                data-testid="memory-input"
              />
              <Button type="submit" size="sm" disabled={!draft.trim() || saving} data-testid="memory-add">
                Add
              </Button>
            </form>

            {loaded && memories.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nothing saved yet. Tip: in any chat, type <span className="font-mono">/remember</span> followed by a fact.
              </p>
            ) : (
              <ul className="max-h-64 space-y-1.5 overflow-y-auto" data-testid="memory-list">
                {memories.map((m) => (
                  <li key={m.id} className="flex items-start gap-2 rounded-md bg-secondary/40 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 break-words">{m.content}</span>
                    <button
                      type="button"
                      onClick={() => remove(m.id)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                      aria-label={`Forget: ${m.content}`}
                      data-testid="memory-delete"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-muted-foreground">
              {memories.length}/{MAX_MEMORIES} saved · Memory is never shared and is removed by &quot;Delete my data&quot;.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
