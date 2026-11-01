"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PROMPTS_CHANGED_EVENT } from "@/components/workspace/account-dialogs";
import type { SavedPromptRecord } from "@/types/chat";

// Saved prompts: reusable messages you insert from the chat's "/" menu.

const MAX_PROMPTS = 50;

export default function SavedPromptsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [prompts, setPrompts] = useState<SavedPromptRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/prompts")
      .then(async (res) => {
        if (res.status === 503) return setUnavailable(true);
        if (!res.ok) throw new Error();
        setPrompts(((await res.json()) as { prompts: SavedPromptRecord[] }).prompts);
      })
      .catch(() => toast.error("Couldn't load your prompts."))
      .finally(() => setLoaded(true));
  }, []);

  const changed = () => window.dispatchEvent(new Event(PROMPTS_CHANGED_EVENT));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim() || saving) return;
    setSaving(true);
    const res = await fetch("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), content: content.trim() }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      toast.error(res?.status === 409 ? `You can keep up to ${MAX_PROMPTS} prompts.` : "Couldn't save that prompt.");
      return;
    }
    const { prompt } = (await res.json()) as { prompt: SavedPromptRecord };
    setPrompts((prev) => [...prev, prompt]);
    setTitle("");
    setContent("");
    changed();
  }

  async function remove(id: string) {
    const before = prompts;
    setPrompts((prev) => prev.filter((p) => p.id !== id));
    const res = await fetch(`/api/prompts?id=${id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setPrompts(before);
      toast.error("Couldn't delete that prompt.");
      return;
    }
    changed();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-w-md" data-testid="saved-prompts-dialog">
        <DialogHeader>
          <DialogTitle>📌 Saved prompts</DialogTitle>
          <DialogDescription>
            Messages you send often. In any chat, type <span className="font-mono">/</span> and pick one to drop it into
            the message box.
          </DialogDescription>
        </DialogHeader>
        {unavailable ? (
          <p className="text-sm text-muted-foreground">Saved prompts aren&apos;t switched on for this site yet.</p>
        ) : (
          <div className="space-y-4">
            <form onSubmit={add} className="space-y-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 80))}
                placeholder="Name, e.g. Weekly status"
                disabled={!loaded || prompts.length >= MAX_PROMPTS}
                data-testid="saved-prompts-title"
              />
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, 4000))}
                placeholder="The prompt, e.g. Write my weekly QA status from these notes: …"
                rows={3}
                disabled={!loaded || prompts.length >= MAX_PROMPTS}
                data-testid="saved-prompts-content"
              />
              <Button type="submit" size="sm" disabled={!title.trim() || !content.trim() || saving} data-testid="saved-prompts-add">
                Save prompt
              </Button>
            </form>
            {loaded && prompts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No saved prompts yet.</p>
            ) : (
              <ul className="max-h-64 space-y-1.5 overflow-y-auto" data-testid="saved-prompts-list">
                {prompts.map((p) => (
                  <li key={p.id} className="flex items-start gap-2 rounded-md bg-secondary/40 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.title}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{p.content}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                      aria-label={`Delete prompt ${p.title}`}
                      data-testid="saved-prompts-delete"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
