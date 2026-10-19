"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Web Speech API — speech-to-text hook. Client-only, feature-detected.
// The API has no lib.dom typings yet, so we declare the minimal surface here.

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export type VoiceLang = "en-IN" | "hi-IN";

export const VOICE_LANGS: { value: VoiceLang; label: string }[] = [
  { value: "en-IN", label: "English (India)" }, // handles Hinglish reasonably
  { value: "hi-IN", label: "हिन्दी (Hindi)" },
];

export function useSpeechRecognition({
  lang,
  onFinal,
}: {
  lang: VoiceLang;
  onFinal: (text: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Ref keeps the latest callback without re-creating the recognition session.
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition)
    );
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor || recognitionRef.current) return;

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text) onFinalRef.current(text);
        } else {
          interimText += result[0].transcript;
        }
      }
      setInterim(interimText);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      setInterim("");
    };
    recognition.onerror = () => {
      // onend fires after onerror and cleans up state.
    };

    recognitionRef.current = recognition;
    setInterim("");
    setListening(true);
    recognition.start();
  }, [lang]);

  // Abort a live session if the component unmounts mid-listen.
  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { supported, listening, interim, start, stop };
}
