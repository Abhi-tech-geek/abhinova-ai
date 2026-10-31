import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectNoteRecord, ProjectRecord, ProjectWithStats } from "@/types/projects";
import type { DocumentRecord } from "@/types/documents";
import { withIndexMode } from "@/lib/rag/retrieve";
import type { ProjectSourceRecord } from "@/types/connectors";

// Project-scoped helpers + free-tier limits. Every query runs through the
// caller's RLS-bound client, so a project id from another user never resolves.

export const GUEST_MAX_PROJECTS = 1;
export const GUEST_MAX_DOCUMENTS = 2;
export const MAX_SOURCES_PER_PROJECT = 10;
export const MAX_ITEMS_PER_SYNC = 200;
export const MAX_CHUNKS_PER_PROJECT = 4000;
export const MAX_NOTES_PER_PROJECT = 50;

export const PROJECT_COLUMNS =
  "id, name, description, custom_instructions, icon, color, is_archived, created_at, updated_at";

/** The caller's project, or null (missing OR someone else's — same answer). */
export async function getOwnedProject(
  supabase: SupabaseClient,
  projectId: string
): Promise<ProjectRecord | null> {
  const { data } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("id", projectId)
    .maybeSingle();
  return (data as ProjectRecord | null) ?? null;
}

/** Ready documents in a project (drives "answering from N documents"). */
export async function countProjectDocuments(
  supabase: SupabaseClient,
  projectId: string
): Promise<number> {
  const { count } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "ready");
  return count ?? 0;
}

/** Total chunks across a project's documents (per-project cap). */
export async function countProjectChunks(
  supabase: SupabaseClient,
  projectId: string
): Promise<number> {
  const { count } = await supabase
    .from("document_chunks")
    .select("id, documents!inner(project_id)", { count: "exact", head: true })
    .eq("documents.project_id", projectId);
  return count ?? 0;
}

/** All of the caller's projects with card stats (documents, chats, activity). */
export async function listProjectsWithStats(
  supabase: SupabaseClient
): Promise<ProjectWithStats[]> {
  const { data: projects } = await supabase
    .from("projects")
    .select(PROJECT_COLUMNS)
    .order("updated_at", { ascending: false });
  const list = (projects ?? []) as ProjectRecord[];
  if (list.length === 0) return [];

  const ids = list.map((p) => p.id);
  const [{ data: docs }, { data: chats }] = await Promise.all([
    supabase.from("documents").select("project_id").in("project_id", ids),
    supabase.from("conversations").select("project_id, updated_at").in("project_id", ids),
  ]);

  return list.map((p) => {
    const projectChats = (chats ?? []).filter((c) => c.project_id === p.id);
    const lastActivity = projectChats.reduce<string>(
      (max, c) => ((c.updated_at as string) > max ? (c.updated_at as string) : max),
      p.updated_at
    );
    return {
      ...p,
      documentCount: (docs ?? []).filter((d) => d.project_id === p.id).length,
      chatCount: projectChats.length,
      lastActivity,
    };
  });
}

export interface ProjectDetail {
  project: ProjectRecord;
  notes: ProjectNoteRecord[];
  documents: DocumentRecord[];
  sources: ProjectSourceRecord[];
  chats: { id: string; title: string; updated_at: string }[];
}

/** Everything the project home needs, RLS-scoped. Null if not the caller's. */
export async function loadProjectDetail(
  supabase: SupabaseClient,
  projectId: string
): Promise<ProjectDetail | null> {
  const project = await getOwnedProject(supabase, projectId);
  if (!project) return null;
  const [notes, documents, sources, chats] = await Promise.all([
    supabase.from("project_notes").select("id, content, created_at").eq("project_id", project.id).order("created_at"),
    supabase
      .from("documents")
      .select("id, file_name, file_type, storage_path, status, created_at, source_url, project_id")
      .eq("project_id", project.id)
      .is("source_id", null)
      .order("created_at", { ascending: false }),
    supabase.from("project_sources").select("*").eq("project_id", project.id).order("created_at"),
    supabase
      .from("conversations")
      .select("id, title, updated_at")
      .eq("project_id", project.id)
      .order("updated_at", { ascending: false }),
  ]);
  return {
    project,
    notes: (notes.data ?? []) as ProjectNoteRecord[],
    documents: await withIndexMode(supabase, (documents.data ?? []) as DocumentRecord[]),
    sources: (sources.data ?? []) as ProjectSourceRecord[],
    chats: (chats.data ?? []) as ProjectDetail["chats"],
  };
}
