import { z } from "zod";
import { PROJECT_COLORS } from "@/types/projects";

// All Projects zod schemas live here — never inline in routes (CLAUDE.md).

export const projectIdSchema = z.string().uuid();

export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name").max(80),
  description: z.string().trim().max(500).optional(),
  custom_instructions: z.string().trim().max(4000).optional(),
  icon: z.string().trim().min(1).max(8).default("📁"),
  color: z.enum(PROJECT_COLORS).default("violet"),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  custom_instructions: z.string().trim().max(4000).nullable().optional(),
  icon: z.string().trim().min(1).max(8).optional(),
  color: z.enum(PROJECT_COLORS).optional(),
  is_archived: z.boolean().optional(),
  /** Attach already-uploaded documents to this project. */
  attachDocumentIds: z.array(z.string().uuid()).max(50).optional(),
  /** Detach one document (it stays in the user's library). */
  detachDocumentId: z.string().uuid().optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/** DELETE ?deleteDocuments=true also removes the project's files + chunks. */
export const deleteProjectQuerySchema = z.object({
  deleteDocuments: z.enum(["true", "false"]).default("false"),
});

export const createNoteSchema = z.object({
  content: z.string().trim().min(1).max(1000),
});
export const updateNoteSchema = z.object({
  noteId: z.string().uuid(),
  content: z.string().trim().min(1).max(1000),
});
export const deleteNoteSchema = z.object({
  noteId: z.string().uuid(),
});
