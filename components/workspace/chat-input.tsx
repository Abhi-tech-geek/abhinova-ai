"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { MicButton } from "@/components/voice/mic-button";
import { TtsToggle } from "@/components/voice/tts-toggle";
import { ModelPicker } from "@/components/code-studio/model-picker";
import type { VoiceLang } from "@/lib/voice/useSpeechRecognition";

const MAX_CHARS = 8000;

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled = false,
  voiceLang,
  onVoiceLangChange,
  ttsEnabled,
  onTtsChange,
  modelId,
  onModelChange,
}: {
  modelId: string;
  onModelChange: (modelId: string) => void;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled?: boolean;
  voiceLang: VoiceLang;
  onVoiceLangChange: (lang: VoiceLang) => void;
  ttsEnabled: boolean;
  onTtsChange: (enabled: boolean) => void;
}) {
  const [interim, setInterim] = useState("");
  const nearLimit = value.length > MAX_CHARS - 500;

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!streaming && value.trim()) onSend();
    }
  }

  function appendFinalTranscript(text: string) {
    onChange((value ? `${value} ${text}` : text).slice(0, MAX_CHARS));
  }

  return (
    <div className="glass overflow-hidden rounded-[22px] border-border shadow-glass">
      {/* Input row — textarea + mic + gradient send (design source) */}
      <div className="flex items-end gap-2.5 py-2 pl-4 pr-2">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={handleKeyDown}
          placeholder="Message AbhiNova…"
          rows={1}
          disabled={disabled}
          className="max-h-32 min-h-[42px] flex-1 resize-none border-0 bg-transparent py-2.5 text-[15px] leading-relaxed focus-visible:ring-0"
          data-testid="chat-input-textarea"
        />
        <MicButton
          lang={voiceLang}
          onInterim={setInterim}
          onFinal={appendFinalTranscript}
          disabled={disabled || streaming}
        />
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px] border border-border text-muted-foreground transition-colors hover:text-foreground"
            title="Stop"
            data-testid="chat-input-stop"
          >
            ■
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={disabled || !value.trim()}
            className="brand-gradient grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px] text-lg text-white shadow-glow-primary transition-transform hover:-translate-y-0.5 hover:brightness-110 active:scale-90 disabled:opacity-50"
            title="Send"
            data-testid="chat-input-send"
          >
            ↑
          </button>
        )}
      </div>

      {interim && (
        <p
          className="px-4 pb-1 text-xs italic text-muted-foreground/60"
          data-testid="chat-input-interim"
        >
          {interim}…
        </p>
      )}

      {/* Meta row — model pill · Attach · Agents · status (design source) */}
      <div className="flex min-w-0 items-center gap-1 px-3 pb-2.5 pt-0.5 sm:gap-2">
        <ModelPicker
          value={modelId}
          onChange={onModelChange}
          testID="chat-input-model-picker"
          className="max-w-[9.5rem] sm:max-w-56"
        />
        <button
          type="button"
          onClick={() => toast.info("Attachments in chat are coming soon — use Documents for file Q&A.")}
          className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-[9px] px-2 text-xs text-muted-foreground transition-colors hover:bg-secondary/50 sm:px-2.5"
          aria-label="Attach"
          data-testid="chat-input-attach"
        >
          📎<span className="hidden sm:inline">Attach</span>
        </button>
        <button
          type="button"
          onClick={() => toast.info("Agents are coming soon.")}
          className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-[9px] px-2 text-xs text-muted-foreground transition-colors hover:bg-secondary/50 sm:px-2.5"
          aria-label="Agents"
          data-testid="chat-input-agents"
        >
          ⚡<span className="hidden sm:inline">Agents</span>
        </button>
        <TtsToggle
          ttsEnabled={ttsEnabled}
          onTtsChange={onTtsChange}
          lang={voiceLang}
          onLangChange={onVoiceLangChange}
        />
        <span className="flex-1" />
        <span
          className={`shrink-0 text-[11px] ${nearLimit ? "text-warning" : "hidden text-muted-foreground/50 sm:inline"}`}
          data-testid="chat-input-charcount"
        >
          {nearLimit ? `${value.length}/${MAX_CHARS}` : "AbhiNova · reasoning on"}
        </span>
      </div>
    </div>
  );
}
