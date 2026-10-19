import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestBlocks } from "@/lib/rag/ingest";
import { getConnectorAuth } from "@/lib/connectors/oauth";
import { fetchUrlDocument, UnsafeUrlError } from "@/lib/connectors/web";
import { fetchJiraIssues } from "@/lib/connectors/jira";
import { fetchGitHubRepo } from "@/lib/connectors/github";
import { fetchNotionPages } from "@/lib/connectors/notion";
import { fetchDriveFiles } from "@/lib/connectors/gdrive";
import { countProjectChunks, MAX_CHUNKS_PER_PROJECT, MAX_ITEMS_PER_SYNC } from "@/lib/projects/scope";
import type {
  AdapterContext,
  AdapterResult,
  ConnectorProvider,
  NormalizedDoc,
  ProjectSourceRecord,
} from "@/types/connectors";
import type { ExtractedBlock } from "@/types/documents";

// Every source → NormalizedDoc → the SAME ingest pipeline (lib/rag/ingest.ts).
// This file owns the sync lifecycle: incremental fetch, upsert by
// (source, external id) so re-sync never duplicates, skip unchanged items,
// per-project chunk cap, and a time budget so one request never outruns the
// serverless timeout (an interrupted sync resumes on the next "Sync now").

const ADAPTERS: Record<ConnectorProvider, (ctx: AdapterContext) => Promise<AdapterResult>> = {
  jira: fetchJiraIssues,
  github: fetchGitHubRepo,
  notion: fetchNotionPages,
  gdrive: fetchDriveFiles,
};

const TIME_BUDGET_MS = 40_000;

/** A NormalizedDoc's blocks, each carrying the doc-level metadata (issue key…). */
export function docToBlocks(doc: NormalizedDoc): ExtractedBlock[] {
  const base = doc.blocks && doc.blocks.length > 0 ? doc.blocks : [{ text: doc.text, metadata: {} }];
  return base.map((b) => ({ text: b.text, metadata: { ...doc.metadata, ...b.metadata } }));
}

export interface SyncOutcome {
  status: "synced" | "partial" | "failed";
  processed: number;
  skippedUnchanged: number;
  redactedSecrets: number;
  message: string | null;
}

async function fetchDocs(
  supabase: SupabaseClient,
  source: ProjectSourceRecord
): Promise<AdapterResult> {
  if (source.source_type === "url") {
    return { docs: [await fetchUrlDocument(source.config.url ?? "")], truncated: false };
  }
  const provider = source.source_type;
  const auth = await getConnectorAuth(supabase, provider);
  if (!auth) throw new Error(`Connect ${provider} first (or reconnect — the session expired).`);
  return ADAPTERS[provider]({
    accessToken: auth.accessToken,
    metadata: auth.metadata,
    config: source.config,
    since: source.last_synced_at,
    limit: MAX_ITEMS_PER_SYNC,
  });
}

export async function syncProjectSource(
  supabase: SupabaseClient,
  userId: string,
  source: ProjectSourceRecord
): Promise<SyncOutcome> {
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + TIME_BUDGET_MS;
  await supabase.from("project_sources").update({ sync_status: "syncing", sync_error: null }).eq("id", source.id);

  let processed = 0;
  let skippedUnchanged = 0;
  let redactedSecrets = 0;

  try {
    const { docs, truncated } = await fetchDocs(supabase, source);
    let chunkBudget = MAX_CHUNKS_PER_PROJECT - (await countProjectChunks(supabase, source.project_id));
    let partial = false;
    let limitHit = false;

    for (const doc of docs) {
      if (Date.now() > deadline) {
        partial = true;
        break;
      }
      if (chunkBudget <= 0) {
        limitHit = true;
        break;
      }

      const { data: existing } = await supabase
        .from("documents")
        .select("id, updated_at, status")
        .eq("source_id", source.id)
        .eq("external_id", doc.externalId)
        .maybeSingle();

      if (
        existing &&
        existing.status === "ready" &&
        doc.updatedAt &&
        new Date(existing.updated_at as string) >= new Date(doc.updatedAt)
      ) {
        skippedUnchanged++;
        continue;
      }

      const row = {
        file_name: doc.title.slice(0, 200) || "Untitled",
        file_type: doc.sourceType,
        source_url: doc.sourceUrl,
        status: "processing",
      };
      let documentId = existing?.id as string | undefined;
      if (documentId) {
        await supabase.from("documents").update(row).eq("id", documentId);
      } else {
        const { data: created, error } = await supabase
          .from("documents")
          .insert({
            ...row,
            user_id: userId,
            project_id: source.project_id,
            source_id: source.id,
            external_id: doc.externalId,
          })
          .select("id")
          .single();
        if (error || !created) throw new Error("Could not save a synced item");
        documentId = created.id as string;
      }

      try {
        const result = await ingestBlocks(supabase, {
          userId,
          documentId,
          blocks: docToBlocks(doc),
        });
        chunkBudget -= result.chunkCount;
        redactedSecrets += result.redactedSecrets;
        await supabase
          .from("documents")
          .update({ status: "ready", updated_at: doc.updatedAt ?? new Date().toISOString() })
          .eq("id", documentId);
        processed++;
      } catch {
        await supabase.from("documents").update({ status: "failed" }).eq("id", documentId);
      }
    }

    const { count } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("source_id", source.id);

    const notes: string[] = [];
    if (partial) notes.push(`Synced ${processed} item(s) so far — press Sync again to continue.`);
    if (truncated) notes.push(`Only the first ${MAX_ITEMS_PER_SYNC} items were fetched (free-tier cap).`);
    if (limitHit) notes.push(`Project knowledge limit reached (${MAX_CHUNKS_PER_PROJECT} chunks) — remove a source to add more.`);
    if (redactedSecrets > 0) notes.push(`${redactedSecrets} credential-like value(s) were redacted before indexing.`);

    const complete = !partial && !limitHit;
    await supabase
      .from("project_sources")
      .update({
        sync_status: complete ? "synced" : "idle",
        // Only a complete pass moves the incremental watermark forward.
        ...(complete ? { last_synced_at: startedAt } : {}),
        sync_error: notes.length ? notes.join(" ") : null,
        item_count: count ?? 0,
      })
      .eq("id", source.id);

    return {
      status: complete ? "synced" : "partial",
      processed,
      skippedUnchanged,
      redactedSecrets,
      message: notes.length ? notes.join(" ") : null,
    };
  } catch (err) {
    const message =
      err instanceof UnsafeUrlError || err instanceof Error ? err.message : "Sync failed.";
    await supabase
      .from("project_sources")
      .update({ sync_status: "failed", sync_error: message.slice(0, 300) })
      .eq("id", source.id);
    return { status: "failed", processed, skippedUnchanged, redactedSecrets, message };
  }
}
