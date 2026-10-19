import type { AdapterContext, AdapterResult, NormalizedDoc } from "@/types/connectors";
import type { ExtractedBlock } from "@/types/documents";

// Notion (OAuth, read-content capability) → one NormalizedDoc per page the
// user shared with the integration. Headings split blocks so citations can
// name the section. SERVER-ONLY.

const API = "https://api.notion.com/v1";
const MAX_BLOCK_PAGES = 3; // up to 300 top-level blocks per page

interface RichText {
  plain_text?: string;
}
interface NotionBlock {
  type: string;
  [key: string]: unknown;
}
interface NotionPage {
  id: string;
  url: string;
  last_edited_time: string;
  properties: Record<string, { type: string; title?: RichText[] }>;
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
}

const plain = (rt: RichText[] | undefined) => (rt ?? []).map((t) => t.plain_text ?? "").join("");

function pageTitle(page: NotionPage): string {
  const titleProp = Object.values(page.properties).find((p) => p.type === "title");
  return plain(titleProp?.title) || "Untitled page";
}

async function pageBlocks(token: string, pageId: string): Promise<ExtractedBlock[]> {
  const blocks: ExtractedBlock[] = [];
  let heading: string | undefined;
  let lines: string[] = [];
  const flush = () => {
    if (lines.length) blocks.push({ text: lines.join("\n"), metadata: heading ? { heading } : {} });
    lines = [];
  };

  let cursor: string | undefined;
  for (let i = 0; i < MAX_BLOCK_PAGES; i++) {
    const url = new URL(`${API}/blocks/${pageId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);
    const res = await fetch(url, { headers: headers(token) });
    if (!res.ok) break;
    const data = (await res.json()) as { results: NotionBlock[]; has_more: boolean; next_cursor: string | null };

    for (const block of data.results) {
      const body = block[block.type] as { rich_text?: RichText[]; checked?: boolean } | undefined;
      const text = plain(body?.rich_text);
      if (block.type.startsWith("heading_")) {
        flush();
        heading = text.slice(0, 120) || undefined;
        lines.push(text);
      } else if (block.type === "bulleted_list_item" || block.type === "numbered_list_item") {
        lines.push(`- ${text}`);
      } else if (block.type === "to_do") {
        lines.push(`[${body?.checked ? "x" : " "}] ${text}`);
      } else if (text) {
        lines.push(text);
      }
    }
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  flush();
  return blocks;
}

export async function fetchNotionPages(ctx: AdapterContext): Promise<AdapterResult> {
  const docs: NormalizedDoc[] = [];
  let truncated = false;
  let cursor: string | undefined;
  const query = (ctx.config.query ?? "").trim();

  outer: while (true) {
    const res = await fetch(`${API}/search`, {
      method: "POST",
      headers: headers(ctx.accessToken),
      body: JSON.stringify({
        ...(query ? { query } : {}),
        filter: { property: "object", value: "page" },
        sort: { direction: "descending", timestamp: "last_edited_time" },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Notion returned status ${res.status}.`);
    const data = (await res.json()) as { results: NotionPage[]; has_more: boolean; next_cursor: string | null };

    for (const page of data.results) {
      // Sorted newest-first: everything after this point is unchanged.
      if (ctx.since && page.last_edited_time < ctx.since) break outer;
      if (docs.length >= ctx.limit) {
        truncated = true;
        break outer;
      }
      const title = pageTitle(page);
      const blocks = await pageBlocks(ctx.accessToken, page.id);
      if (blocks.length === 0) continue;
      docs.push({
        title: title.slice(0, 200),
        text: blocks.map((b) => b.text).join("\n\n"),
        blocks,
        sourceUrl: page.url,
        sourceType: "notion",
        externalId: page.id,
        updatedAt: page.last_edited_time,
        metadata: {},
      });
    }
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return { docs, truncated };
}
