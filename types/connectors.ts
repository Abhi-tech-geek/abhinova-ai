// Shared knowledge-source + connector types.
import type { ChunkMetadata, ExtractedBlock } from "./documents";

export type ConnectorProvider = "jira" | "github" | "notion" | "gdrive";
export type SourceType = "url" | ConnectorProvider;
export type SyncStatus = "idle" | "syncing" | "synced" | "failed";

/**
 * The ONE shape every knowledge source is converted into before it enters the
 * shared chunk → embed → store pipeline (lib/connectors/normalize.ts).
 */
export interface NormalizedDoc {
  title: string;
  text: string;
  sourceUrl: string | null;
  sourceType: SourceType;
  /** Stable id inside the source (issue key, page id, file path) — upsert key. */
  externalId: string;
  /** Source-side last-modified time; unchanged items are skipped on re-sync. */
  updatedAt?: string;
  /** Optional pre-split blocks with richer provenance (sheets, slides…). */
  blocks?: ExtractedBlock[];
  metadata: ChunkMetadata;
}

/** What every connector adapter receives (server-side only). */
export interface AdapterContext {
  accessToken: string;
  /** Provider extras saved at connect time (e.g. Jira cloudId/siteUrl). */
  metadata: Record<string, string>;
  config: Record<string, string>;
  /** ISO time of the last complete sync — fetch only what changed since. */
  since: string | null;
  limit: number;
}

export interface AdapterResult {
  docs: NormalizedDoc[];
  /** More items existed than the per-sync cap allowed. */
  truncated: boolean;
}

/** A field the user fills when attaching a connector source to a project. */
export interface SourceConfigField {
  key: string;
  label: string;
  placeholder: string;
  help?: string;
}

/** Client-safe connector definition — the UI renders entirely from these. */
export interface ConnectorDefinition {
  id: ConnectorProvider;
  label: string;
  icon: string;
  description: string;
  /** Plain-English list of exactly what will be read, shown before connecting. */
  accessSummary: string[];
  /** Read-only / least-privilege scopes requested. */
  scopes: string[];
  configFields: SourceConfigField[];
}

/** Per-provider status the UI needs (computed server-side, no secrets). */
export interface ConnectorStatus {
  id: ConnectorProvider;
  /** OAuth app credentials exist in the server env. */
  configured: boolean;
  connected: boolean;
  accountLabel: string | null;
}

/** connector_accounts row as exposed to the client — never tokens. */
export interface ConnectorAccountPublic {
  provider: ConnectorProvider;
  account_label: string | null;
  created_at: string;
}

/** project_sources row as used by the UI. */
export interface ProjectSourceRecord {
  id: string;
  project_id: string;
  source_type: SourceType;
  title: string;
  config: Record<string, string>;
  last_synced_at: string | null;
  sync_status: SyncStatus;
  sync_error: string | null;
  item_count: number;
  created_at: string;
}
