"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { VoiceRing } from "@/components/voice/voice-ring";
import { useSpeechRecognition, type VoiceLang } from "@/lib/voice/useSpeechRecognition";

export function MicButton({
  lang,
  onInterim,
  onFinal,
  disabled = false,
}: {
  lang: VoiceLang;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  disabled?: boolean;
}) {
  const { supported, listening, interim, start, stop } = useSpeechRecognition({
    lang,
    onFinal,
  });

  useEffect(() => {
    onInterim(interim);
    // Parent only needs the latest interim text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interim]);

  function handleClick() {
    if (!supported) {
      toast.info("Voice input isn't supported in this browser", {
        description: "Try Chrome or Edge — or just type your message.",
      });
      return;
    }
    if (listening) stop();
    else start();
  }

  return (
    <div className="relative shrink-0">
      {listening && <VoiceRing />}
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={listening ? "Stop listening" : "Speak your message"}
        className={`relative grid h-[42px] w-[42px] place-items-center rounded-[13px] text-lg transition-colors disabled:opacity-50 ${
          listening
            ? "brand-gradient text-white shadow-glow-primary"
            : "border border-border text-muted-foreground hover:text-foreground"
        }`}
        data-testid="chat-input-mic"
      >
        🎤
      </button>
    </div>
  );
}
