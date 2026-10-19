// Shared Projects types (see CLAUDE.md: all shared types live in /types).

export const PROJECT_COLORS = ["violet", "blue", "teal", "amber", "rose", "slate"] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

/** projects table row as used by the UI. */
export interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  custom_instructions: string | null;
  icon: string;
  color: ProjectColor;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

/** Project card stats (computed server-side). */
export interface ProjectWithStats extends ProjectRecord {
  documentCount: number;
  chatCount: number;
  lastActivity: string;
}

/** project_notes table row. */
export interface ProjectNoteRecord {
  id: string;
  content: string;
  created_at: string;
}
