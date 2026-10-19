import type { ConnectorDefinition, ConnectorProvider } from "@/types/connectors";

// Connector registry — CLIENT-SAFE (no secrets, no env reads). The UI renders
// entirely from this list; adding a provider = one entry here + one adapter
// file in lib/connectors/ + its OAuth config in lib/connectors/oauth.ts.

export const CONNECTORS: ConnectorDefinition[] = [
  {
    id: "jira",
    label: "Jira",
    icon: "🎫",
    description: "Sync issues, acceptance criteria and comments — generate test cases straight from tickets.",
    accessSummary: [
      "Read issues, comments and standard fields in projects you can already see",
      "Your Jira site name (to build links back to each issue)",
      "Read-only: nothing is ever created, edited or deleted in Jira",
    ],
    scopes: ["read:jira-work", "read:jira-user", "offline_access"],
    configFields: [
      {
        key: "jql",
        label: "JQL filter",
        placeholder: "project = PROJ ORDER BY updated DESC",
        help: "Which issues to sync. Max 200 per sync; re-sync only fetches what changed.",
      },
    ],
  },
  {
    id: "github",
    label: "GitHub",
    icon: "🐙",
    description: "Index a repository's README, docs/ folder, issues and PR descriptions.",
    accessSummary: [
      "Public repositories only: README, docs/ markdown, issues and PR descriptions",
      "No scopes requested — the token cannot write anything",
      ".env, keys and other secret files are never indexed",
    ],
    scopes: [],
    configFields: [
      {
        key: "repo",
        label: "Repository",
        placeholder: "owner/name",
        help: "Public repo, e.g. vercel/next.js. Private repos need a GitHub App (planned).",
      },
    ],
  },
  {
    id: "notion",
    label: "Notion",
    icon: "📓",
    description: "Pull selected Notion pages into the project knowledge base.",
    accessSummary: [
      "Only the pages you tick in Notion's own consent screen",
      "Read content only — the integration cannot edit or comment",
    ],
    scopes: ["read_content"],
    configFields: [
      {
        key: "query",
        label: "Page title filter (optional)",
        placeholder: "Release notes",
        help: "Leave blank to sync every page you shared with AbhiNova (max 200).",
      },
    ],
  },
  {
    id: "gdrive",
    label: "Google Drive",
    icon: "🗂️",
    description: "Index Google Docs, Sheets and Slides by name or folder.",
    accessSummary: [
      "Google Docs, Sheets and Slides that match your filter",
      "Read-only Drive access (drive.readonly) — nothing is changed or shared",
    ],
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    configFields: [
      {
        key: "query",
        label: "Name contains (optional)",
        placeholder: "Test plan",
        help: "Filter by file name. Max 200 files per sync.",
      },
      {
        key: "folderId",
        label: "Folder ID (optional)",
        placeholder: "1AbC…",
        help: "From the folder URL: drive.google.com/drive/folders/<ID>",
      },
    ],
  },
];

export function getConnector(id: string): ConnectorDefinition | undefined {
  return CONNECTORS.find((c) => c.id === id);
}

export const CONNECTOR_IDS = CONNECTORS.map((c) => c.id) as ConnectorProvider[];
