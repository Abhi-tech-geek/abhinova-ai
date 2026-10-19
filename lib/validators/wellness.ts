import { z } from "zod";

// All wellness zod schemas live here — never inline in routes (see CLAUDE.md).

export const PERSONAS = ["dost", "sage", "coach", "socrates"] as const;
export const personaSchema = z.enum(PERSONAS);
export type Persona = z.infer<typeof personaSchema>;

export const wellnessChatSchema = z.object({
  action: z.literal("chat").default("chat"),
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(8000),
  persona: personaSchema.default("dost"),
});
export type WellnessChatRequest = z.infer<typeof wellnessChatSchema>;

export const endSessionSchema = z.object({
  action: z.literal("end"),
  conversationId: z.string().uuid(),
});

export const wellnessChatRequestSchema = z.union([
  endSessionSchema,
  wellnessChatSchema,
]);

export const moodCheckInSchema = z.object({
  mood: z.number().int().min(1).max(5),
  note: z.string().max(2000).optional(),
  sleepHours: z.number().min(0).max(24).optional(),
});
export type MoodCheckIn = z.infer<typeof moodCheckInSchema>;

export const journalAnalyzeSchema = z.object({
  content: z.string().min(1).max(8000),
});
export type JournalAnalyzeRequest = z.infer<typeof journalAnalyzeSchema>;

/** AI output shape for journal analysis (parsed with fallback + retry). */
export const journalAnalysisOutputSchema = z.object({
  distortions: z.array(z.string()).max(3),
  reframe: z.string().min(1),
  gentleNote: z.string().min(1),
});
export type JournalAnalysisOutput = z.infer<typeof journalAnalysisOutputSchema>;
