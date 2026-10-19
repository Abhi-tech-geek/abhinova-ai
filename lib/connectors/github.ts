import { isSecretPath } from "@/lib/code/secret-scan";
import type { AdapterContext, AdapterResult, NormalizedDoc } from "@/types/connectors";

// GitHub (OAuth, no scopes = public read-only) → README, docs/*.md, issues and
// PR descriptions as NormalizedDocs. Secret paths are never fetched; content
// is additionally redacted by the shared ingest pipeline. SERVER-ONLY.

const API = "https://api.github.com";
const MAX_DOC_FILES = 30;
const MAX_FILE_BYTES = 200_000;

export const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

interface ContentEntry {
  type: string;
  name: string;
  path: string;
  size: number;
  html_url: string;
  download_url: string | null;
}

interface Issue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  updated_at: string;
  labels: { name: string }[];
  pull_request?: unknown;
}

export async function fetchGitHubRepo(ctx: AdapterContext): Promise<AdapterResult> {
  const repo = (ctx.config.repo ?? "").trim();
  if (!REPO_PATTERN.test(repo)) throw new Error("Repository must look like owner/name.");
  const headers = {
    Authorization: `Bearer ${ctx.accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const docs: NormalizedDoc[] = [];
  let truncated = false;
  const push = (doc: NormalizedDoc) => {
    if (docs.length >= ctx.limit) {
      truncated = true;
      return false;
    }
    docs.push(doc);
    return true;
  };

  const repoRes = await fetch(`${API}/repos/${repo}`, { headers });
  if (repoRes.status === 404) throw new Error("Repository not found (only public repos are supported).");
  if (!repoRes.ok) throw new Error(`GitHub returned status ${repoRes.status}.`);

  // README
  const readmeRes = await fetch(`${API}/repos/${repo}/readme`, { headers });
  if (readmeRes.ok) {
    const readme = (await readmeRes.json()) as { path: string; content: string; html_url: string; size: number };
    if (readme.size <= MAX_FILE_BYTES && !isSecretPath(readme.path)) {
      push({
        title: `${repo} — ${readme.path}`,
        text: Buffer.from(readme.content, "base64").toString("utf8"),
        sourceUrl: readme.html_url,
        sourceType: "github",
        externalId: `file:${readme.path}`,
        metadata: { path: readme.path },
      });
    }
  }

  // docs/ folder (top level, markdown/text only)
  const docsRes = await fetch(`${API}/repos/${repo}/contents/docs`, { headers });
  if (docsRes.ok) {
    const entries = ((await docsRes.json()) as ContentEntry[])
      .filter((e) => e.type === "file" && /\.(md|mdx|txt|rst)$/i.test(e.name))
      .filter((e) => !isSecretPath(e.path) && e.size <= MAX_FILE_BYTES)
      .slice(0, MAX_DOC_FILES);
    for (const entry of entries) {
      if (!entry.download_url) continue;
      const fileRes = await fetch(entry.download_url, { headers });
      if (!fileRes.ok) continue;
      if (
        !push({
          title: `${repo} — ${entry.path}`,
          text: await fileRes.text(),
          sourceUrl: entry.html_url,
          sourceType: "github",
          externalId: `file:${entry.path}`,
          metadata: { path: entry.path },
        })
      )
        break;
    }
  }

  // Issues + PRs (the issues endpoint returns both), newest first, incremental.
  let page = 1;
  while (!truncated && page <= 5) {
    const url = new URL(`${API}/repos/${repo}/issues`);
    url.searchParams.set("state", "all");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("sort", "updated");
    url.searchParams.set("direction", "desc");
    url.searchParams.set("page", String(page));
    if (ctx.since) url.searchParams.set("since", ctx.since);
    const res = await fetch(url, { headers });
    if (!res.ok) break;
    const issues = (await res.json()) as Issue[];
    if (issues.length === 0) break;
    for (const issue of issues) {
      const kind = issue.pull_request ? "PR" : "Issue";
      const labels = issue.labels.map((l) => l.name).join(", ");
      if (
        !push({
          title: `${repo} ${kind} #${issue.number} — ${issue.title}`.slice(0, 200),
          text: [
            `${kind} #${issue.number}: ${issue.title}`,
            `State: ${issue.state}${labels ? ` | Labels: ${labels}` : ""}`,
            issue.body ?? "",
          ].join("\n\n"),
          sourceUrl: issue.html_url,
          sourceType: "github",
          externalId: `${kind.toLowerCase()}:${issue.number}`,
          updatedAt: issue.updated_at,
          metadata: { issueKey: `#${issue.number}` },
        })
      )
        break;
    }
    if (issues.length < 100) break;
    page++;
  }

  return { docs, truncated };
}
