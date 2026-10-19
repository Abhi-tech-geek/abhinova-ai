"use client";

import { useCallback, useEffect, useState } from "react";
import type { VoiceLang } from "@/lib/voice/useSpeechRecognition";

// Web Speech API — text-to-speech hook. Picks a voice matching the chosen
// language; speaking stops whenever speak() or stop() is called again.

export function useSpeechSynthesis(lang: VoiceLang) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load(); // voices may already be cached…
    window.speechSynthesis.addEventListener("voiceschanged", load); // …or load async
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const stop = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      // Exact lang match first, then same language family (e.g. hi-IN → hi).
      const voice =
        voices.find((v) => v.lang === lang) ??
        voices.find((v) => v.lang.startsWith(lang.split("-")[0]));
      if (voice) utterance.voice = voice;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [lang, voices]
  );

  // Cut speech off if the component unmounts.
  useEffect(() => stop, [stop]);

  return { supported, speaking, speak, stop, voices };
}

/** Markdown → speakable plain text (code blocks become a short notice). */
export function stripMarkdownForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " Code snippet omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\|/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}
