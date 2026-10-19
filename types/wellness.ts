// Shared wellness interfaces (see CLAUDE.md: all shared types live in /types).
export type {
  Persona,
  MoodCheckIn,
  JournalAnalysisOutput,
} from "@/lib/validators/wellness";

/** mood_logs table row as used by the UI. */
export interface MoodLogRecord {
  id: string;
  mood: number;
  note: string | null;
  sleep_hours: number | null;
  created_at: string;
}

/** journal_entries table row as used by the UI. */
export interface JournalEntryRecord {
  id: string;
  content: string;
  distortions: string[] | null;
  reframe: string | null;
  created_at: string;
}

/** Chat message shape inside the wellness talk panel (kept local to wellness). */
export interface WellnessMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}
