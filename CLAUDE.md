# AbhiNova AI — Project Conventions

Read this file fully before making any change. Every rule here is binding for every session.

## Project Identity
- AbhiNova AI is **productivity-first**. Wellness Mode is an optional, isolated layer. Default UX must NEVER feel therapy-like.
- Design language: dark mode first, glassmorphism, soft neon accents, premium typography, smooth Framer Motion animations. Light mode must also be fully supported via a theme toggle.
- Stack (FINAL — do not substitute): Next.js 16 App Router (React 19) + TypeScript strict, Tailwind CSS + shadcn/ui + Framer Motion, Supabase (Postgres + Auth + Storage + pgvector), Groq API (primary LLM, default `openai/gpt-oss-120b`) + Google Gemini (fallback LLMs `gemini-flash-latest` → `gemini-flash-lite-latest`, then one delayed Groq retry — `lib/ai/router.ts`; embeddings `gemini-embedding-001` @ 768 dims), Web Speech API (voice), Recharts (charts). Deployed on Vercel at abhinova.theabhinavsaxena.in.

## Commands
- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — ESLint 9 flat config (`eslint.config.mjs`; `next lint` no longer exists)

## Folder Structure (canonical — new files MUST fit this tree)

```
abhinova-ai/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── auth/callback/route.ts
│   ├── (workspace)/
│   │   ├── layout.tsx              # sidebar + auth-protected shell
│   │   ├── chat/
│   │   │   ├── page.tsx
│   │   │   └── [conversationId]/page.tsx
│   │   ├── qa-studio/
│   │   │   ├── page.tsx            # tools grid dashboard
│   │   │   └── [tool]/page.tsx     # individual tool view
│   │   ├── documents/page.tsx
│   │   ├── projects/
│   │   │   ├── page.tsx            # all projects grid
│   │   │   └── [projectId]/
│   │   │       ├── page.tsx        # project home: knowledge, chats, instructions, notes
│   │   │       └── chat/[conversationId]/page.tsx   # "new" = fresh chat in the project
│   │   ├── code-studio/
│   │   │   ├── page.tsx            # project picker + workspace
│   │   │   └── [projectId]/page.tsx
│   │   ├── settings/page.tsx
│   ├── (wellness)/
│   │   ├── layout.tsx              # calm theme shell, isolated
│   │   ├── talk/page.tsx
│   │   ├── mood/page.tsx
│   │   ├── journal/page.tsx
│   │   └── progress/page.tsx
│   ├── api/
│   │   ├── chat/route.ts
│   │   ├── qa/[tool]/route.ts
│   │   ├── documents/upload/route.ts
│   │   ├── documents/process/route.ts
│   │   ├── documents/query/route.ts
│   │   ├── projects/
│   │   │   ├── route.ts             # create / list projects
│   │   │   └── [projectId]/
│   │   │       ├── route.ts         # get / update / delete project
│   │   │       ├── notes/route.ts   # project memory notes
│   │   │       └── sources/route.ts # add / remove / sync knowledge sources
│   │   ├── connectors/[provider]/
│   │   │   ├── connect/route.ts     # OAuth start (GET) / disconnect (DELETE)
│   │   │   ├── callback/route.ts    # OAuth callback (tokens encrypted)
│   │   │   └── sync/route.ts        # pull + index content
│   │   ├── code/
│   │   │   ├── chat/route.ts        # coding agent (explain/fix/refactor/generate)
│   │   │   ├── edit/route.ts        # produce diffs for files (never auto-writes)
│   │   │   └── docs/route.ts        # PRD / TRD / architecture doc generation
│   │   ├── conversations/[conversationId]/share/route.ts  # GET/POST/DELETE a chat's public share link
│   │   ├── account/data/route.ts    # DELETE: wipe all of the caller's data (typed confirmation)
│   │   ├── cron/keepalive/route.ts  # daily Vercel cron (CRON_SECRET) so free Supabase doesn't pause
│   │   ├── models/
│   │   │   ├── list/route.ts        # available + user-configured models
│   │   │   └── keys/route.ts        # BYOK: add/remove encrypted user API keys
│   │   └── wellness/
│   │       ├── chat/route.ts
│   │       ├── mood/route.ts
│   │       └── journal/route.ts
│   ├── admin/                      # owner-only usage dashboard (page + login/logout routes)
│   ├── layout.tsx                  # root layout + ThemeProvider
│   ├── page.tsx                    # landing → redirect to /chat or /login
│   └── globals.css
├── components/
│   ├── ui/                         # shadcn components ONLY (auto-generated)
│   ├── shared/                     # CommandPalette, WelcomeTour (first-visit product tour), FeedbackDialog, DeleteMyData, Logo, LocalTime, EmptyState, ErrorBoundary
│   ├── workspace/                  # Sidebar (nav + history, Claude-style), UserMenu, SessionList, ConversationList, ChatMessage, ChatMarkdown, ChatActions (export/share), ChatInput, ThinkingOrb, LocalModeBanner
│   ├── qa-studio/                  # ToolCard, ToolForm, OutputPanel, HistoryTab, ExportButtons
│   ├── documents/                  # UploadDropzone, DocumentList, DocumentPicker, CitationChip, ChunkViewer
│   ├── projects/                   # ProjectCard, ProjectGrid, CreateProjectDialog, KnowledgePanel, ProjectInstructions, ProjectNotes, ProjectChatList, ProjectSwitcher, ProjectHeader, ProjectSelect, SourceCard, AddSourceDialog, SyncStatusBadge
│   ├── connectors/                 # ConnectorGrid, ConnectorCard, ConnectDialog (rendered from the registry)
│   ├── admin/                      # UsageDashboard, usage charts (Recharts), AdminLogin — owner-only /admin
│   ├── code-studio/                # ProjectPicker, FileTree, DiffViewer, CodeEditor, RunPanel, TerminalOutput, ModelPicker, DocGenPanel
│   ├── voice/                      # MicButton, VoiceRing, TtsToggle
│   └── wellness/                   # WellnessBanner, PersonaPicker, MoodCheckIn, MoodChart, JournalEditor, CrisisCard, MusicPlayer, SessionSummary
├── lib/
│   ├── supabase/
│   │   ├── client.ts               # browser client
│   │   ├── server.ts               # server client
│   │   └── admin.ts                # service-role client (server-only, rare use)
│   ├── ai/
│   │   ├── groq.ts
│   │   ├── gemini.ts
│   │   ├── embeddings.ts
│   │   ├── router.ts               # Groq→Gemini fallback logic (Local Mode → Ollama only)
│   │   ├── agent.ts                # Agent Mode tool loop (Groq / Ollama tool calling)
│   │   ├── calculator.ts           # safe arithmetic parser for the agent (no eval)
│   │   └── prompts/                # ALL system prompts live here as named exports (agent.ts = AGENT_SYSTEM_PROMPT)
│   │       ├── workspace.ts
│   │       ├── qa-tools.ts
│   │       ├── project-agent.ts
│   │       ├── code-agent.ts
│   │       ├── wellness.ts
│   │       └── safety.ts           # GUARDRAILS (harm refusal + prompt confidentiality) + IST clock note
│   ├── rag/
│   │   ├── extract.ts              # pdf/docx/doc/pptx/xlsx/xls/csv/txt/md/json/code extraction
│   │   ├── chunk.ts
│   │   ├── ingest.ts               # THE single redact → chunk → embed → store pipeline
│   │   └── retrieve.ts
│   ├── code/
│   │   ├── fs-access.ts            # File System Access API wrapper (pick dir, read/write with permission)
│   │   ├── project-index.ts        # build file map, respect .gitignore + secret denylist
│   │   ├── diff.ts                 # generate + apply reviewed diffs
│   │   ├── sandbox.ts              # WebContainers run wrapper (browser-isolated)
│   │   └── secret-scan.ts          # block .env/secret files from ever reaching the LLM
│   ├── projects/
│   │   ├── context.ts              # project context assembly (instructions → notes → chunks, token budget)
│   │   └── scope.ts                # project-scoped loaders + free-tier limits
│   ├── connectors/
│   │   ├── registry.ts             # connector definitions (client-safe; UI renders from it)
│   │   ├── oauth.ts                # OAuth flow + encrypted token storage / refresh / revoke
│   │   ├── jira.ts                 # issues + comments → NormalizedDoc
│   │   ├── github.ts               # README / docs / issues / PRs → NormalizedDoc
│   │   ├── notion.ts               # pages → NormalizedDoc
│   │   ├── gdrive.ts               # Docs / Sheets / Slides → NormalizedDoc
│   │   ├── web.ts                  # SSRF-guarded URL fetch + readable text
│   │   └── normalize.ts            # adapters → lib/rag/ingest; sync lifecycle
│   ├── models/
│   │   ├── registry.ts             # built-in models (Groq, Gemini) + provider definitions
│   │   └── byok.ts                 # encrypt/decrypt + fetch user keys (server-only)
│   ├── crypto/
│   │   └── encrypt.ts              # AES-GCM helpers using a server-only ENCRYPTION_KEY
│   ├── voice/
│   │   ├── useSpeechRecognition.ts
│   │   └── useSpeechSynthesis.ts
│   ├── wellness/
│   │   ├── crisis.ts               # crisis signal check
│   │   └── distortions.ts          # fixed cognitive distortion list
│   ├── validators/                 # all zod schemas, one file per domain
│   │   ├── chat.ts
│   │   ├── agent.ts                # tool-call argument schemas
│   │   ├── qa.ts
│   │   ├── documents.ts
│   │   ├── projects.ts
│   │   ├── connectors.ts
│   │   ├── feedback.ts
│   │   ├── admin.ts
│   │   ├── code.ts
│   │   ├── models.ts
│   │   └── wellness.ts
│   ├── admin/
│   │   └── auth.ts                 # ADMIN_DASHBOARD_TOKEN check + HMAC cookie (server-only)
│   ├── beta/
│   │   ├── config.ts               # isOpenBeta() + BETA_LIMITS + friendly error copy (client-safe)
│   │   ├── quota.ts                # enforceBetaQuota() / getBetaUsage() (server-only, service role)
│   │   └── client.ts               # showBetaLimitToast() for UI error handlers
│   ├── rate-limit.ts
│   ├── auth.ts                     # getAuthenticatedUser(), guardRoute()
│   └── utils.ts
├── hooks/                          # useMounted, useConversations, useDocuments etc.
├── types/
│   ├── index.ts                    # re-exports
│   ├── chat.ts
│   ├── qa.ts
│   ├── documents.ts
│   ├── projects.ts
│   ├── connectors.ts
│   ├── code.ts
│   ├── models.ts
│   └── wellness.ts
├── supabase/
│   └── migrations/
│       ├── 001_init.sql            # never edit — new changes go in new numbered files
│       ├── 002_projects_connectors.sql
│       ├── 003_open_beta.sql      # beta_usage counters + consume_beta_quota() + guest write access
│       ├── 004_feedback.sql       # in-app feedback (server-only submit_feedback RPC, 10/user/24h)
│       ├── 005_admin_stats.sql    # admin_usage_stats() aggregates for /admin (service role only)
├── design-reference/               # Claude Design export (source design) — read as the visual foundation
├── private-learning/               # NEVER pushed to git (in .gitignore)
├── public/
├── proxy.ts                        # Next 16 "proxy" (was middleware.ts): session refresh, open-beta guest session, 404s
├── CLAUDE.md
├── .env.example
└── .gitignore
```

### Structure Rules
- New file? It MUST fit an existing folder above. No new top-level folders without strong reason.
- System prompts NEVER inline in routes — always in `lib/ai/prompts/`.
- zod schemas NEVER inline — always in `lib/validators/`.
- `components/ui` is shadcn-only; custom components go in their feature folder.
- Wellness code ONLY in `(wellness)`, `components/wellness`, `lib/wellness`, and `api/wellness` — nowhere else.

## Layout Rules
- Workspace shell = ONE sidebar, no top bar (Claude/ChatGPT style): brand + collapse → New (context-aware) → Search (opens Cmd+K) → feature nav (Chats, Projects, QA Studio, Code Studio, Documents) → the current feature's history grouped Today / Yesterday / Previous 7 days / Previous 30 days / Older → account menu (Settings, Theme, Wellness mode, Sign out).
- History rows: single-line title, "⋯" menu for Rename/Delete. New features add a NAV entry + a history list in `components/workspace/sidebar.tsx`; never bring back a top bar.
- Anything that depends on the viewer's timezone/locale (dates, "Today" buckets, "5m ago") renders after mount — use `<LocalTime>` / `useMounted()`. Never call `toLocaleString()` directly in JSX (server is UTC → hydration errors).
- Don't use framer-motion `initial={{ opacity: 0 }}` on content visible at first paint (it is server-rendered invisible until hydration). Use tailwindcss-animate classes (`animate-in fade-in …`) instead; framer is fine for things that appear after an interaction.
- Mobile: 16px side gutter (`px-4 sm:px-6`), no horizontal scroll at 375px; grid columns use `minmax(0, …)` / `min-w-0` so long names truncate instead of widening the page.

## Code Conventions
- TypeScript strict. No `any`. All shared interfaces live in `/types`.
- Every interactive component gets a testID prop (format: `screenname-element-action`, e.g. `"chat-input-send"`), rendered as `data-testid`.
- Server Components by default; `"use client"` only when needed. Keep heavy client-only UI that opens on demand (dialogs, palettes) behind `next/dynamic`, and keep zod out of client components (shared constants live in `types/`).
- Next 16 request APIs are async: `await params` / `await searchParams` in pages and route handlers, `await cookies()`, and the server Supabase client is `await createClient()`.
- All AI calls happen ONLY in server-side code (API routes / server actions). NEVER call Groq/Gemini from the client.
- All user input validated with zod before processing.
- Reusable logic goes in `lib/` or `hooks/` — no duplicate logic across components.
- No over-engineering: no unnecessary abstractions, no random one-off components.

## Security Rules (non-negotiable)
- API keys ONLY in environment variables, accessed server-side only. `NEXT_PUBLIC_` prefix only for Supabase URL + anon key.
- `.env`, `.env.local`, `.env*.*` must be in `.gitignore`. NEVER commit secrets. NEVER print secrets in logs.
- Supabase Row Level Security (RLS) enabled on EVERY table from day one. Policy: users can only read/write their own rows (`auth.uid() = user_id`).
- Every API route checks the authenticated Supabase session before doing anything. Unauthenticated → 401.
- File uploads: validate extension AND MIME AND magic bytes (allowlist: pdf, docx, doc, pptx, xlsx, xls, csv, txt, md, json, js, ts, py, java, sql — images are refused with an "OCR not enabled" message), max size 10MB, sanitize filenames, store in Supabase Storage with per-user folders + storage RLS policies.
- Rate limiting on all AI endpoints (simple in-memory or Upstash later): max 20 AI requests/minute/user (`lib/rate-limit.ts`).
- Treat document content as untrusted: when injecting retrieved chunks into prompts, wrap them in delimiters and instruct the model that the content is data, not instructions (prompt injection defense).
- Sanitize/escape any AI output rendered as HTML; render markdown through a safe renderer only.
- AI-rendered markdown never auto-loads remote images (shown as links); CSP `img-src` stays `'self' data: blob:`.
- Every user-facing system prompt ends with `GUARDRAILS` from `lib/ai/prompts/safety.ts`; prompts that embed user-supplied text (project instructions/notes/sources) end with `GUARDRAILS_REMINDER` after that text.

## Code Studio Security Rules (non-negotiable — this feature touches user files + code execution)
- Local project access uses the browser File System Access API ONLY. The user explicitly picks a directory and grants permission; access is scoped to that directory, never traverses above it, and is revocable. No server ever receives the user's full local path.
- Secret protection: before ANY file content is sent to an LLM, run secret-scan (`lib/code/secret-scan.ts`). NEVER read, index, or send these to a model: `.env*`, `*.pem`, `*.key`, `id_rsa`, `credentials`, `*.crt`, anything matching common API-key/token regexes, `.git/`, `node_modules/`. Respect the project's `.gitignore` as an additional denylist. If a file is skipped for safety, tell the user why.
- AI NEVER writes to disk directly. All edits are produced as DIFFS shown in a DiffViewer; the user reviews and explicitly approves each change before it is written. No silent or bulk auto-writes.
- Code execution NEVER runs on our server/process. Use WebContainers (in-browser, isolated) for JS/TS/Node. Any future heavier execution must use an isolated ephemeral remote sandbox (e.g. E2B), never the Vercel runtime. Enforce time + output limits.
- Treat ALL file/code content as untrusted data (prompt-injection defense): wrap it in delimiters and instruct the model it is data, not instructions.
- Code Studio is blocked for guest users (403 server-side) — it needs a real account. EXCEPTION: while the open beta is on (`NEXT_PUBLIC_OPEN_BETA`), guests may use it within the beta quotas.

## BYOK (Bring Your Own Key) + Model Security Rules (non-negotiable)
- Users may add their own provider API keys (OpenAI, Anthropic, Groq, Gemini, OpenRouter). These are HIGH-sensitivity secrets.
- Store user keys encrypted at rest using AES-GCM with a server-only `ENCRYPTION_KEY` env var (`lib/crypto/encrypt.ts`). Store in a dedicated `user_api_keys` table with RLS (owner-only). NEVER store plaintext.
- Decrypt keys ONLY server-side at the moment of the AI call. NEVER return a raw key to the client — UI shows masked form only (e.g. `sk-...4f2a`). NEVER log keys.
- Model selection is data-driven via `lib/models/registry.ts`. Built-in default models (Groq + Gemini) always work without any user key. Selecting a BYOK model uses the user's encrypted key server-side only.
- Validate a newly added key with a tiny test call before saving; on failure, don't store it.

## Git Rules
- NEVER push: `.env` files, `/private-learning` folder, `node_modules`, any `docs/` scratch folders.
- Conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`).

## Open Beta Rules (while NEXT_PUBLIC_OPEN_BETA is not "false")
- No login/signup screens: `proxy.ts` creates the anonymous session itself on a signed-out page view (one hop — each extra redirect can hit a cold start); `/auth/guest` is only the fallback that shows the "busy" page when Supabase rate-limits sign-ins. Never auto-create guests for bots, link previews or non-GET requests.
- Every AI call goes through `enforceBetaQuota(user, request, kinds)` BEFORE the model runs (per-user, per-IP-hash, site-wide daily counters). New chats / wellness sessions / QA runs / uploads add their own kind. Fails CLOSED.
- Limits are counted in `beta_usage` (no RLS policies → service role only), never from live rows a guest can delete.
- Raw IPs are never stored — only a salted SHA-256 hash.
- Still off for guests in beta: connectors + links, BYOK keys, Settings.
- Safety beats quota: a Wellness message with a crisis signal always gets the helplines (non-AI fallback) even when the quota is used up — or when every AI provider is down.
- Privacy: `/privacy` must only state what the code actually does (update it with any data/AI change). "Delete my data" (`DELETE /api/account/data`, body `{confirm:"DELETE"}`) deletes via the user's own client so RLS limits it to their rows; new user-data tables must be added to its list. It keeps the session and the beta counters (no limit reset).
- Local Mode (`OLLAMA_URL` set, own machine only — never on Vercel): every AI call and embedding goes to Ollama with NO cloud fallback, beta quotas are skipped, and `ollama/<model>` ids resolve only there (elsewhere they are `unknown_model`). Ollama down → `local_ai_offline`. (`lib/ai/router.ts`): `ai_busy` (503) when the whole fallback chain is out of quota/overloaded, which the UI shows as "AbhiNova is taking a short break". The unsent text goes back to the input box, and a just-created chat/session is kept so the resend does not use another lifetime slot.
- New limit → add it to `BETA_LIMITS` + `BETA_ERROR_MESSAGES`; UI error handlers call `showBetaLimitToast(res)` first.

## Agent Mode Rules (non-negotiable)
- Off by default; the ⚡ Agent toggle in ChatInput sends `agent: true` to `/api/chat` (remembered per browser tab). Same auth, rate limit and beta quota as a normal chat — checked BEFORE the tool loop.
- Tools are read-only and fixed in `lib/ai/agent.ts`: wikipedia_search, read_webpage, search_my_documents, calculator, current_time. Budget: 4 rounds, 3 calls/round, 2 page reads per answer. A new tool = a schema in `lib/validators/agent.ts` + a case in `execute()`; never a tool that writes, sends, or spends.
- `read_webpage` goes through `safeFetchText` (`lib/connectors/web.ts`) only — same SSRF rules. Guests may use it (one-off read, nothing stored), unlike saved link sources.
- Every tool result is wrapped in `<tool_result>` and the prompt says it is DATA (prompt-injection defence); `search_my_documents` uses `retrieveChunks` so RLS/project scoping still applies.
- Steps stream as `STEP_FRAME_PREFIX` frames before the reply and are saved in `messages.metadata.steps`. Cloud tool model down → answer through the normal fallback chain with a "fallback" step; Local Mode → `local_ai_offline`, never the cloud.

## Projects Rules (non-negotiable)
- `project_id` is NULLABLE everywhere (conversations, documents, qa_artifacts, code_docs). Chats/documents without a project must keep working exactly as before.
- Project retrieval is scoped by the `p_project_id` RPC parameter (SECURITY INVOKER — RLS still applies). Never assemble project context from another project's chunks.
- Context order is fixed: system safety prompt → `<project_instructions>` → `<project_notes>` → retrieved `<document_content>` → recent messages. Instructions + notes always included; chunks are trimmed first when over budget (`lib/projects/context.ts`).
- Custom instructions shape tone/role/format but can NEVER override system safety rules — they are layered below the system prompt.
- Guests: max 1 project and 2 documents, enforced server-side (API 403 + RLS), never only in the UI.
- A future `project_members` table (team projects) must be addable without restructuring.
- Schema changes go in NEW numbered migrations (`002_…`, `003_…`) — never edit `001_init.sql`.

## Connector + Knowledge Source Security Rules (non-negotiable)
- Every source (file, URL, Jira, GitHub, Notion, Drive) becomes a `NormalizedDoc` and goes through `lib/rag/ingest.ts`. NEVER write a second RAG pipeline. A new provider = one adapter file in `lib/connectors/` + a registry entry + its OAuth config.
- OAuth tokens are secrets: AES-GCM encrypted (same helper as BYOK) in `connector_accounts` (RLS owner-only). Decrypt server-side only, never send to the client, never log. Refresh server-side.
- Least-privilege, read-only scopes only. Show the user exactly what will be accessed BEFORE connecting. "Disconnect" revokes at the provider where an API exists, deletes tokens, and optionally the synced data.
- OAuth CSRF: random `state` in an httpOnly cookie scoped to `/api/connectors/<provider>`, compared with `timingSafeEqual` in the callback.
- ALL external content is UNTRUSTED: wrapped in delimiters, the model is told it is data — a Jira ticket saying "ignore previous instructions" must have no effect.
- Secret redaction (`redactSecrets`) runs on ALL ingested content before embedding; the user is told how many values were redacted.
- URL fetching: `lib/connectors/web.ts` ONLY. http(s) + default ports, no credentials in URLs, private/loopback/link-local/metadata IPs blocked at socket-lookup time (no DNS-rebinding window), manual redirects (max 3) re-checked each hop, 10s timeout, 2MB cap.
- Free-tier discipline: max 200 items per sync, 4000 chunks per project, 10 sources per project; friendly limit message instead of silent truncation. Sync is time-budgeted (40s) and resumable (unchanged items skipped by `updatedAt`; upsert by `(source_id, external_id)` so re-sync never duplicates).
- Guests cannot use links or connectors (403 server-side + RLS).

## Learning Documentation Rules (private-learning/ — for the developer's eyes only, NEVER pushed to git)
- At the END of EVERY session, before finishing, write a learning doc: `private-learning/0X-{session-name}.md`.
- Audience: a QA engineer with ~2 years experience who is learning full-stack + AI engineering. Beginner-friendly, simple English, no jargon without explanation.
- Every learning doc MUST contain these sections:
  1. **"Aaj kya bana"** — plain summary of what was built this session
  2. **"Kaise kaam karta hai"** — step-by-step data flow (e.g. user clicks send → API route → auth check → Groq → stream → DB), with a simple text diagram
  3. **"Kyun aise banaya"** — key decisions and the alternatives we rejected, with reasons
  4. **"Naye concepts"** — every new concept used this session (e.g. RLS, streaming, embeddings, middleware) explained in 3-5 simple lines each, with a real-world analogy
  5. **"Important files"** — list of files created/changed and one line on what each does
  6. **"Galtiyan / gotchas"** — anything that broke during the session, why, and how it was fixed
  7. **"Interview angle"** — 2-3 questions an interviewer could ask about this session's work, with short answers
- If a session changes something built earlier, update the old doc's affected section too.
- These docs are personal learning notes. `private-learning/` stays in `.gitignore` permanently.

## Wellness Mode Rules
- Lives in its own module (`app/(wellness)`, `components/wellness`, `lib/wellness`). Zero imports from wellness into core workspace logic — only a single integration point: the WellnessModeProvider/toggle.
- Wellness AI must always include: **"AbhiNova is not a replacement for a professional therapist"** in its first wellness-mode message of a session (constant in `lib/ai/prompts/wellness.ts`).
- Crisis detection must surface Indian helplines (**Tele-MANAS 14416**, **KIRAN 1800-599-0019**) and never attempt to handle crisis alone (`lib/wellness/crisis.ts`).

## Design System

> **SYNCED** from `design-reference/AbhiNova AI.dc.html` (Claude Design export —
> the single source of truth for the visual language). If the design export is
> updated, re-derive tokens from it and update `app/globals.css`,
> `tailwind.config.ts`, and this section together.

Tokens live as HSL-triplet CSS variables in `app/globals.css` (one block per theme: `:root` = light, `.dark` = dark, `.wellness` = wellness) and are exposed through `tailwind.config.ts`. Theme switching is class-based via next-themes (`components/shared/theme-provider.tsx`, themes: `dark` | `light` | `wellness`, default `dark`).

### Colors (source hex from the design export)
| Token | Dark (default) | Light | Wellness |
|---|---|---|---|
| `background` | `#06070d` deep space | `#f3f1ec` warm off-white | `#f4ede4` warm cream |
| `foreground` | `#eef0fa` | `#1b1d28` | `#3c342e` warm brown |
| `card` | `#10121c` | `#ffffff` | `#fcf6ee` |
| `primary` (accentSolid) | `#7c8cff` periwinkle | `#5566e0` | `#dd9070` warm peach |
| `accent` (gradient end) | `#9a6bff` violet | `#8b5cf6` | `#e58aa0` rose |
| `destructive` | `#f85149` | `#d13438`-ish | soft red |
| `success` | `#3fb950` | deep green | sage green |
| `warning` | `#ffd24a` | `#d29922` | warm amber |
| `muted-foreground` | `#9096ad` | `#5b6072` | `#7a6f64` |

**Signature gradient** (the brand mark, 120deg): dark `#4f8cff→#9a6bff`, light `#3b6fe0→#8b5cf6`, wellness `#f0a868→#e58aa0`. Available as `--grad-from`/`--grad-to` vars and the `.brand-gradient` / `.text-gradient` utilities. Used on: user chat bubbles, hero CTAs.

Chart palette: `chart-1`..`chart-5` = gradient-from, gradient-to, success, warning, rose (per theme).

### Typography
- `font-sans` AND `font-display` — **Space Grotesk** (the design uses it everywhere; CSS var `--font-sans`)
- `font-mono` — **JetBrains Mono** (code, `--font-mono`)

### Radius & Effects
- `--radius`: `1.125rem` (18px, dark/light), `1.5rem` (24px, wellness — rounder = calmer). Use `rounded-lg/md/sm`.
- Glow shadows: `shadow-glow-primary`, `shadow-glow-accent`; animated `animate-pulse-glow` (auto-adapt per theme via vars).
- Glass surfaces: `.glass` utility (blurred translucent card + soft border) + `shadow-glass`.
- Text glow for hero/CTA text: `.text-glow`; gradient text: `.text-gradient`.
- Ambient background blobs use primary/accent vars — auto-adapt per theme.

### Usage Rules
- Never invent a parallel visual style; reuse these tokens and mirror `design-reference/` components (screenshots in `design-reference/screenshots/`).
- Never hardcode hex values in components — always Tailwind token classes (or `.brand-gradient` for the signature gradient).
- Wellness screens automatically inherit the warm calm palette via the `.wellness` wrapper in `app/(wellness)/layout.tsx` — do not add wellness-specific colors elsewhere.
