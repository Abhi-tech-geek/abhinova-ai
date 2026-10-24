import type { SupabaseClient } from "@supabase/supabase-js";
import { retrieveChunks, buildDocumentContext } from "@/lib/rag/retrieve";
import { countProjectDocuments } from "@/lib/projects/scope";
import {
  PROJECT_AGENT_SYSTEM_PROMPT,
  PROJECT_NO_DOCUMENTS_NOTE,
  formatProjectInstructions,
  formatProjectNotes,
  formatProjectSources,
} from "@/lib/ai/prompts/project-agent";
import { GUARDRAILS_REMINDER } from "@/lib/ai/prompts/safety";
import type { ProjectRecord } from "@/types/projects";
import type { RetrievedSource } from "@/types/documents";

// Assembles a project chat's system context in the fixed order:
//   custom_instructions → notes → retrieved chunks (project-scoped)
// Recent messages are added by the caller (and trimmed by fitToTokenBudget).
// Budget: instructions + notes are ALWAYS included; chunks are trimmed first.

const CHARS_PER_TOKEN = 4;
const CONTEXT_BUDGET_TOKENS = 4500;
const RETRIEVE_COUNT = 8;

export interface ProjectContext {
  systemPrompt: string;
  sources: RetrievedSource[];
  documentCount: number;
}

export async function assembleProjectContext(
  supabase: SupabaseClient,
  project: ProjectRecord,
  question: string,
  isFirstMessage: boolean
): Promise<ProjectContext> {
  const [{ data: noteRows }, documentCount] = await Promise.all([
    supabase
      .from("project_notes")
      .select("content")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true }),
    countProjectDocuments(supabase, project.id),
  ]);

  const fixedParts = [PROJECT_AGENT_SYSTEM_PROMPT];
  if (project.custom_instructions?.trim()) {
    fixedParts.push(formatProjectInstructions(project.custom_instructions.trim()));
  }
  const notes = (noteRows ?? []).map((n) => n.content as string);
  if (notes.length > 0) fixedParts.push(formatProjectNotes(notes));

  if (documentCount === 0) {
    if (isFirstMessage) fixedParts.push(PROJECT_NO_DOCUMENTS_NOTE);
    // Last word goes to the guardrails, after any user-supplied text (bug B1).
    return { systemPrompt: [...fixedParts, GUARDRAILS_REMINDER].join("\n\n"), sources: [], documentCount };
  }

  const fixed = fixedParts.join("\n\n");
  let remainingChars = CONTEXT_BUDGET_TOKENS * CHARS_PER_TOKEN - fixed.length - GUARDRAILS_REMINDER.length;

  // Retrieval failure (e.g. embeddings outage) degrades to a plain project chat.
  let ranked: RetrievedSource[] = [];
  try {
    ranked = await retrieveChunks(question, null, project.id, RETRIEVE_COUNT);
  } catch {
    ranked = [];
  }

  // Keep the best-ranked chunks that fit; re-tag S1..Sn so tags stay dense.
  const kept: RetrievedSource[] = [];
  for (const source of ranked) {
    const cost = source.content.length + 200; // + label/delimiter overhead
    if (cost > remainingChars) break;
    remainingChars -= cost;
    kept.push({ ...source, tag: `S${kept.length + 1}` });
  }

  const parts = [fixed];
  if (kept.length > 0) parts.push(formatProjectSources(buildDocumentContext(kept)));
  // Last word goes to the guardrails, after instructions/notes/sources (bug B1).
  parts.push(GUARDRAILS_REMINDER);
  return { systemPrompt: parts.join("\n\n"), sources: kept, documentCount };
}
