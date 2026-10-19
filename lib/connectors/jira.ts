import type { AdapterContext, AdapterResult, NormalizedDoc } from "@/types/connectors";

// Jira (Atlassian OAuth 3LO, read-only) → one NormalizedDoc per issue:
// "PROJ-123 — Summary" with type/status/priority/labels, description,
// acceptance criteria and comments, deep-linked back to Jira. SERVER-ONLY.

const PAGE_SIZE = 100;

interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
}

/** Atlassian Document Format → plain text with sensible line breaks. */
export function adfToText(node: unknown): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  const n = node as AdfNode;
  if (n.type === "text") return n.text ?? "";
  if (n.type === "hardBreak") return "\n";
  const inner = (n.content ?? []).map(adfToText).join("");
  if (n.type === "listItem") return `- ${inner.trim()}\n`;
  if (["paragraph", "heading", "blockquote", "codeBlock", "tableRow", "rule"].includes(n.type ?? "")) {
    return `${inner}\n`;
  }
  return inner;
}

interface JiraIssue {
  key: string;
  fields: Record<string, unknown> & {
    summary?: string;
    description?: unknown;
    updated?: string;
    status?: { name?: string };
    priority?: { name?: string };
    issuetype?: { name?: string };
    labels?: string[];
    comment?: { comments?: { author?: { displayName?: string }; created?: string; body?: unknown }[] };
  };
}

/** Splits trailing ORDER BY so we can AND an incremental filter in. */
function withUpdatedSince(jql: string, since: string | null): string {
  const base = jql.trim() || "ORDER BY updated DESC";
  if (!since) return base;
  const match = base.match(/^([\s\S]*?)(\border\s+by\b[\s\S]*)?$/i);
  const filter = (match?.[1] ?? "").trim();
  const order = (match?.[2] ?? "ORDER BY updated DESC").trim();
  // 1-day overlap absorbs Jira's user-timezone date parsing; unchanged items
  // are skipped later by their `updated` timestamp, so nothing duplicates.
  const d = new Date(new Date(since).getTime() - 24 * 60 * 60 * 1000);
  const stamp = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}`;
  return `${filter ? `(${filter}) AND ` : ""}updated >= "${stamp}" ${order}`;
}

export async function fetchJiraIssues(ctx: AdapterContext): Promise<AdapterResult> {
  const { cloudId, siteUrl } = ctx.metadata;
  if (!cloudId) throw new Error("Jira connection is missing its site — reconnect Jira.");
  const api = `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/rest/api/3`;
  const headers = { Authorization: `Bearer ${ctx.accessToken}`, Accept: "application/json" };

  // Acceptance criteria usually lives in a custom field — discover its id.
  let acceptanceFieldId: string | null = null;
  const fieldsRes = await fetch(`${api}/field`, { headers });
  if (fieldsRes.ok) {
    const fields = (await fieldsRes.json()) as { id: string; name: string }[];
    acceptanceFieldId = fields.find((f) => /acceptance\s*criteria/i.test(f.name))?.id ?? null;
  }

  const wanted = ["summary", "description", "status", "priority", "labels", "comment", "updated", "issuetype"];
  if (acceptanceFieldId) wanted.push(acceptanceFieldId);

  const docs: NormalizedDoc[] = [];
  let nextPageToken: string | undefined;
  let truncated = false;
  const jql = withUpdatedSince(ctx.config.jql ?? "", ctx.since);

  do {
    const url = new URL(`${api}/search/jql`);
    url.searchParams.set("jql", jql);
    url.searchParams.set("maxResults", String(PAGE_SIZE));
    url.searchParams.set("fields", wanted.join(","));
    if (nextPageToken) url.searchParams.set("nextPageToken", nextPageToken);

    const res = await fetch(url, { headers });
    if (res.status === 400) throw new Error("Jira rejected the JQL filter — check its syntax.");
    if (!res.ok) throw new Error(`Jira returned status ${res.status}.`);
    const page = (await res.json()) as { issues?: JiraIssue[]; nextPageToken?: string; isLast?: boolean };

    for (const issue of page.issues ?? []) {
      if (docs.length >= ctx.limit) {
        truncated = true;
        break;
      }
      const f = issue.fields;
      const summary = f.summary ?? "(no summary)";
      const meta = [
        f.issuetype?.name && `Type: ${f.issuetype.name}`,
        f.status?.name && `Status: ${f.status.name}`,
        f.priority?.name && `Priority: ${f.priority.name}`,
        f.labels?.length ? `Labels: ${f.labels.join(", ")}` : null,
      ].filter(Boolean);
      const description = adfToText(f.description).trim();
      const acceptance = acceptanceFieldId ? adfToText(f[acceptanceFieldId]).trim() : "";
      const comments = (f.comment?.comments ?? [])
        .slice(-20)
        .map((c) => `- ${c.author?.displayName ?? "Someone"} (${(c.created ?? "").slice(0, 10)}): ${adfToText(c.body).trim()}`)
        .join("\n");

      const text = [
        `${issue.key} — ${summary}`,
        meta.join(" | "),
        description && `Description:\n${description}`,
        acceptance && `Acceptance criteria:\n${acceptance}`,
        comments && `Comments:\n${comments}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      docs.push({
        title: `${issue.key} — ${summary}`.slice(0, 200),
        text,
        sourceUrl: siteUrl ? `${siteUrl.replace(/\/$/, "")}/browse/${issue.key}` : null,
        sourceType: "jira",
        externalId: issue.key,
        updatedAt: f.updated,
        metadata: { issueKey: issue.key },
      });
    }
    nextPageToken = truncated || page.isLast ? undefined : page.nextPageToken;
  } while (nextPageToken);

  return { docs, truncated };
}
