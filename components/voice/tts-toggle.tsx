"use client";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VOICE_LANGS, type VoiceLang } from "@/lib/voice/useSpeechRecognition";

// Voice settings popover: "Voice reply" (TTS) toggle + recognition language.
export function TtsToggle({
  ttsEnabled,
  onTtsChange,
  lang,
  onLangChange,
}: {
  ttsEnabled: boolean;
  onTtsChange: (enabled: boolean) => void;
  lang: VoiceLang;
  onLangChange: (lang: VoiceLang) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          title="Voice settings"
          className={ttsEnabled ? "text-primary" : "text-muted-foreground"}
          data-testid="chat-input-voice-settings"
        >
          {ttsEnabled ? "🔊" : "🔇"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass w-56">
        <DropdownMenuLabel className="text-xs">Voice</DropdownMenuLabel>
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-xs">Voice reply (speak answers)</span>
          <Switch
            checked={ttsEnabled}
            onCheckedChange={onTtsChange}
            data-testid="chat-input-tts-toggle"
          />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">Speech language</DropdownMenuLabel>
        {VOICE_LANGS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onLangChange(option.value)}
            data-testid={`chat-input-voicelang-${option.value}`}
          >
            <span className="mr-2 w-3 text-primary">
              {lang === option.value ? "✓" : ""}
            </span>
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
