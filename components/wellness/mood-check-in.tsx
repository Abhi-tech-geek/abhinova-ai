"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const MOODS = [
  { value: 1, emoji: "😞", label: "Rough" },
  { value: 2, emoji: "😕", label: "Low" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "😄", label: "Great" },
];

export function MoodCheckIn() {
  const router = useRouter();
  const [mood, setMood] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [sleep, setSleep] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (mood === null || saving) return;
    setSaving(true);
    try {
      const sleepHours = sleep.trim() === "" ? undefined : Number(sleep);
      const res = await fetch("/api/wellness/mood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mood,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(sleepHours !== undefined && !Number.isNaN(sleepHours)
            ? { sleepHours }
            : {}),
        }),
      });
      if (!res.ok) {
        toast.error("Couldn't save the check-in. Try again?");
        return;
      }
      toast.success("Check-in saved 🌿");
      setMood(null);
      setNote("");
      setSleep("");
      router.refresh();
    } catch {
      toast.error("Connection failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass rounded-2xl p-5" data-testid="wellness-mood-checkin">
      <h2 className="text-sm font-medium">Aaj kaisa mehsoos ho raha hai?</h2>
      <div className="mt-3 flex gap-2">
        {MOODS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMood(m.value)}
            title={m.label}
            className={`flex h-12 w-12 items-center justify-center rounded-full text-2xl transition-all ${
              mood === m.value
                ? "bg-primary/20 shadow-glow-primary scale-110"
                : "hover:bg-secondary"
            }`}
            data-testid={`wellness-mood-${m.value}`}
          >
            {m.emoji}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_130px]">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 2000))}
          placeholder="Ek note (optional)…"
          rows={2}
          className="resize-none text-sm"
          data-testid="wellness-mood-note"
        />
        <Input
          type="number"
          min={0}
          max={24}
          step={0.5}
          value={sleep}
          onChange={(e) => setSleep(e.target.value)}
          placeholder="Sleep (hrs)"
          data-testid="wellness-mood-sleep"
        />
      </div>
      <Button
        size="sm"
        className="mt-4 rounded-full"
        onClick={save}
        disabled={mood === null || saving}
        data-testid="wellness-mood-save"
      >
        {saving ? "Saving…" : "Save check-in"}
      </Button>
    </div>
  );
}
