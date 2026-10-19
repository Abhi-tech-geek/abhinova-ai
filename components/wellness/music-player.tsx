"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MUSIC_LIBRARY, type MusicCategory } from "@/lib/wellness/music";

const CATEGORIES: { id: MusicCategory; label: string }[] = [
  { id: "lo-fi", label: "🎧 Lo-fi" },
  { id: "rain", label: "🌧️ Rain" },
  { id: "nature", label: "🌲 Nature" },
  { id: "focus", label: "🎯 Focus" },
];

export function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [category, setCategory] = useState<MusicCategory>("lo-fi");
  const [playingSrc, setPlayingSrc] = useState<string | null>(null);

  function toggle(src: string, title: string) {
    if (!src) {
      toast.info(`"${title}" is coming soon`, {
        description: "Add royalty-free audio files — see lib/wellness/music.ts.",
      });
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (playingSrc === src) {
      audio.pause();
      setPlayingSrc(null);
      return;
    }
    audio.src = src;
    audio.loop = true;
    void audio.play();
    setPlayingSrc(src);
  }

  return (
    <div className="glass rounded-2xl p-5" data-testid="wellness-music-player">
      <h2 className="text-sm font-medium">Music corner</h2>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              category === c.id
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`wellness-music-category-${c.id}`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {MUSIC_LIBRARY[category].map((track) => (
          <li key={track.title} className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {track.title}
              {!track.src && <span className="ml-2 text-[10px] opacity-60">(coming soon)</span>}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => toggle(track.src, track.title)}
              data-testid="wellness-music-play"
            >
              {playingSrc === track.src && track.src ? "⏸" : "▶"}
            </Button>
          </li>
        ))}
      </ul>
      <audio ref={audioRef} onEnded={() => setPlayingSrc(null)} />
    </div>
  );
}
