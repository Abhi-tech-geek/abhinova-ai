"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectNoteRecord } from "@/types/projects";

// Permanent short facts the project AI always sees — separate from chat history.
export function ProjectNotes({
  projectId,
  initial,
}: {
  projectId: string;
  initial: ProjectNoteRecord[];
}) {
  const [notes, setNotes] = useState(initial);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const endpoint = `/api/projects/${projectId}/notes`;

  async function add() {
    const content = draft.trim();
    if (!content) return;
    setDraft("");
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDraft(content);
      toast.error(data.error === "note_limit_reached" ? "Note limit reached (50)." : "Couldn't add the note.");
      return;
    }
    setNotes((prev) => [...prev, data.note]);
  }

  async function saveEdit(noteId: string) {
    const content = editValue.trim();
    setEditingId(null);
    if (!content) return;
    const before = notes;
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, content } : n)));
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId, content }),
    });
    if (!res.ok) {
      setNotes(before);
      toast.error("Couldn't update the note.");
    }
  }

  async function remove(noteId: string) {
    const before = notes;
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    const res = await fetch(endpoint, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId }),
    });
    if (!res.ok) {
      setNotes(before);
      toast.error("Couldn't delete the note.");
    }
  }

  return (
    <section className="glass rounded-2xl p-5" data-testid="projects-notes-panel">
      <h2 className="text-sm font-semibold">📌 Notes</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Short facts the AI should always remember here (e.g. &quot;Staging URL is staging.app.com&quot;).
      </p>
      <ul className="mt-3 space-y-1.5">
        {notes.length === 0 && <li className="text-xs text-muted-foreground/60">No notes yet.</li>}
        {notes.map((note) => (
          <li key={note.id} className="group flex items-start gap-2 rounded-lg border border-border/50 px-3 py-2" data-testid="projects-note-item">
            {editingId === note.id ? (
              <Input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value.slice(0, 1000))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEdit(note.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                onBlur={() => saveEdit(note.id)}
                className="h-8 text-xs"
                data-testid="projects-note-edit-input"
              />
            ) : (
              <>
                <span className="flex-1 text-xs leading-relaxed">{note.content}</span>
                <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    title="Edit"
                    onClick={() => {
                      setEditingId(note.id);
                      setEditValue(note.content);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                    data-testid="projects-note-edit"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    onClick={() => remove(note.id)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                    data-testid="projects-note-delete"
                  >
                    ✕
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a note…"
          className="h-9 text-xs"
          data-testid="projects-note-input"
        />
        <Button size="sm" onClick={add} disabled={!draft.trim()} data-testid="projects-note-add">
          Add
        </Button>
      </div>
    </section>
  );
}
