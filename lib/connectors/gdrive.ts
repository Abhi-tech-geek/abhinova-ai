import { extractText } from "@/lib/rag/extract";
import type { AdapterContext, AdapterResult, NormalizedDoc } from "@/types/connectors";

// Google Drive (OAuth drive.readonly) → Docs / Slides exported as text, Sheets
// exported as CSV and run through the same labelled-rows extractor as uploaded
// spreadsheets. Server-side file listing replaces the client-side Picker so
// tokens never reach the browser. SERVER-ONLY.

const API = "https://www.googleapis.com/drive/v3";
const MIME = {
  doc: "application/vnd.google-apps.document",
  sheet: "application/vnd.google-apps.spreadsheet",
  slides: "application/vnd.google-apps.presentation",
} as const;

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
}

/** Escapes a value for a Drive `q` string literal (prevents query injection). */
export function driveQueryLiteral(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export async function fetchDriveFiles(ctx: AdapterContext): Promise<AdapterResult> {
  const headers = { Authorization: `Bearer ${ctx.accessToken}` };
  const clauses = [
    `(mimeType = '${MIME.doc}' or mimeType = '${MIME.sheet}' or mimeType = '${MIME.slides}')`,
    "trashed = false",
  ];
  const name = (ctx.config.query ?? "").trim();
  if (name) clauses.push(`name contains ${driveQueryLiteral(name)}`);
  const folderId = (ctx.config.folderId ?? "").trim();
  if (folderId) {
    if (!/^[A-Za-z0-9_-]+$/.test(folderId)) throw new Error("Folder ID looks invalid.");
    clauses.push(`${driveQueryLiteral(folderId)} in parents`);
  }
  if (ctx.since) clauses.push(`modifiedTime > ${driveQueryLiteral(ctx.since)}`);

  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  let truncated = false;
  do {
    const url = new URL(`${API}/files`);
    url.searchParams.set("q", clauses.join(" and "));
    url.searchParams.set("fields", "nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink)");
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("orderBy", "modifiedTime desc");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Google Drive returned status ${res.status}.`);
    const data = (await res.json()) as { files: DriveFile[]; nextPageToken?: string };
    for (const f of data.files) {
      if (files.length >= ctx.limit) {
        truncated = true;
        break;
      }
      files.push(f);
    }
    pageToken = truncated ? undefined : data.nextPageToken;
  } while (pageToken);

  const docs: NormalizedDoc[] = [];
  for (const file of files) {
    const isSheet = file.mimeType === MIME.sheet;
    const exportUrl = new URL(`${API}/files/${encodeURIComponent(file.id)}/export`);
    exportUrl.searchParams.set("mimeType", isSheet ? "text/csv" : "text/plain");
    const res = await fetch(exportUrl, { headers });
    if (!res.ok) continue; // e.g. export size limit — skip, keep going
    const body = Buffer.from(await res.arrayBuffer());

    // Sheets: Drive's CSV export covers the FIRST sheet only.
    let blocks: NormalizedDoc["blocks"];
    if (isSheet) {
      try {
        blocks = (await extractText(body, "csv")).map((b) => ({
          ...b,
          metadata: { ...b.metadata, sheet: "Sheet 1" },
        }));
      } catch {
        continue; // empty sheet
      }
    }
    const text = isSheet ? (blocks ?? []).map((b) => b.text).join("\n") : body.toString("utf8");
    if (!text.trim()) continue;

    docs.push({
      title: file.name.slice(0, 200),
      text,
      blocks,
      sourceUrl: file.webViewLink,
      sourceType: "gdrive",
      externalId: file.id,
      updatedAt: file.modifiedTime,
      metadata: {},
    });
  }
  return { docs, truncated };
}
