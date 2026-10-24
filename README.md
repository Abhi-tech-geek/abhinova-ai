# AbhiNova AI ✦

**A productivity-first AI workspace — chat, project knowledge bases, QA tools, document Q&A and a code studio in one app, with an optional calm Wellness mode.**

Built with Next.js 16, Supabase (Postgres + pgvector) and Groq / Gemini. Talks English, Hindi and Hinglish.

> 🧪 **Open beta:** no sign-up — open the site and start. Free daily limits keep it fair for everyone (see [Open beta mode](#open-beta-mode-default-on)).

---

## What it does

| | Feature | Highlights |
|---|---|---|
| 💬 | **Chat** | Streaming answers, model picker (Groq → Gemini fallback, or bring your own key), voice input + read-aloud, Ctrl+K command palette |
| 📁 | **Projects** | A mini-AI per project: its own files, links, notes and custom instructions; answers cite the exact page, slide or **Excel sheet + row** |
| 🧪 | **QA Studio** | 8 tools for testers — test cases, bug reports, edge cases, API tests, SQL checks, regression lists, test data, automation snippets; CSV / Markdown export |
| 📄 | **Documents** | Upload PDF, Word, PowerPoint, Excel, CSV, Markdown, JSON or code and ask across them with citations |
| ⌨️ | **Code Studio** | Open a local folder in the browser; explain / fix / refactor with **diffs you approve**; generate PRDs, tech docs and API specs |
| 🔌 | **Connectors** | Pull Jira, GitHub, Notion and Google Drive content into a project (read-only OAuth, incremental sync) |
| 🌿 | **Wellness** *(optional)* | Talk personas, mood check-ins, private journal, gentle insights — with crisis helplines always surfaced; not a replacement for a therapist |

The UI is a Claude/ChatGPT-style sidebar with history grouped by day, dark + light themes, and a first-visit product tour.

## How it's built

```
Browser (Next.js App Router, React, Tailwind, shadcn/ui)
   │  streaming fetch
   ▼
API routes ── auth (Supabase) → zod validation → rate limit → beta quota
   │                                                    │
   │  Groq (primary) ⇄ Gemini (fallback)                │  service-role RPC
   ▼                                                    ▼
One RAG pipeline: extract → redact secrets → chunk → embed (Gemini) → pgvector
   ▲
   └─ files · web links (SSRF-guarded) · Jira / GitHub / Notion / Drive
```

**Security by design**
- Row Level Security on every table; each user only ever sees their own rows.
- Secrets live only in server env vars; user API keys and OAuth tokens are AES-GCM encrypted at rest and never sent to the browser.
- Every document, page and ticket is treated as untrusted data (prompt-injection defence); secrets are redacted before embedding.
- Link import blocks private/internal addresses at connect time (SSRF), with redirect re-checks, size and time caps.
- Code Studio never writes to disk or runs code on the server — every edit is a reviewed diff.
- Open-beta limits are counted server-side in a table guests can't read or reset.

## Tech stack

Next.js 16 (App Router, React 19) · TypeScript (strict) · Tailwind CSS · shadcn/ui · Framer Motion · Supabase (Postgres, Auth, Storage, pgvector) · Groq · Google Gemini · Web Speech API · Recharts · SheetJS · Mammoth · undici

---

## Run it yourself

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FAbhi-tech-geek%2Fabhinova-ai&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,GROQ_API_KEY,GEMINI_API_KEY,ENCRYPTION_KEY&envDescription=Supabase%2C%20Groq%20and%20Gemini%20keys%20%E2%80%94%20see%20the%20README%20Setup%20section&envLink=https%3A%2F%2Fgithub.com%2FAbhi-tech-geek%2Fabhinova-ai%23setup&project-name=abhinova-ai&repository-name=abhinova-ai)
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/Abhi-tech-geek/abhinova-ai)

| Option | Best for | What you need |
|---|---|---|
| **Deploy with Vercel** | A live site that redeploys on every `git push` | Vercel account + the env vars below + a Supabase project with the migrations run |
| **Open in Codespaces** | Coding from any browser, nothing to install | Add the same keys as [Codespaces secrets](https://github.com/settings/codespaces) — the dev server starts automatically on port 3000 |
| **Clone locally** | Your own machine | Node 20+, then follow [Setup](#setup) |

Keys never live in git: use Vercel environment variables, Codespaces secrets, or a local `.env.local`. If two environments share one Supabase database, they must use the **same** `ENCRYPTION_KEY` (it decrypts stored API keys and OAuth tokens).

---

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env.local` and fill in your Supabase, Groq, Gemini and `ENCRYPTION_KEY` values.
3. Set up Supabase (fresh project):
   - Run the migrations **in order** (SQL Editor, or `supabase db push` with the CLI):
     1. `supabase/migrations/001_init.sql`
     2. `supabase/migrations/002_projects_connectors.sql` (Projects, knowledge sources, connectors)
     3. `supabase/migrations/003_open_beta.sql` (open-beta usage limits — required while `NEXT_PUBLIC_OPEN_BETA` is on)
     4. `supabase/migrations/004_feedback.sql` (in-app feedback — read it in Table Editor → `feedback`)
     5. `supabase/migrations/005_admin_stats.sql` (owner usage dashboard at `/admin`, needs `ADMIN_DASHBOARD_TOKEN`)
   - **Auth → Sign In / Up:** enable **"Allow anonymous sign-ins"** (required for Guest Login) and the **Google** provider (add your OAuth client ID/secret).
   - **Auth → URL Configuration:** set the Site URL and add `http://localhost:3000/auth/callback` (and your production domain) to the redirect allowlist.
4. Run the dev server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000).

## Open beta mode (default ON)

No login or signup pages: every visitor automatically gets an anonymous guest session and lands in the app. Limits (in `lib/beta/config.ts`) keep the free AI quota safe:

| Limit | Value |
|---|---|
| New chats per tester (lifetime) | 2 |
| Messages per chat | 10 |
| AI replies per tester per day | 25 |
| AI replies per network (IP) per day | 75 |
| AI replies for the whole site per day | 1000 |
| QA Studio runs per day | 5 |
| Documents per tester | 2 |
| Projects per tester | 1 |
| Wellness Talk sessions | 2 |

Counters live in `beta_usage` (service-role only), so deleting chats never resets a limit. Links/connectors, BYOK keys and Settings stay off for guests. Crisis messages in Wellness always get the helplines, even when the quota is used up.

Turn it off: set `NEXT_PUBLIC_OPEN_BETA=false` and redeploy — login/signup come back.

## Projects & knowledge sources

Projects group chats, files, notes and custom instructions; project chats answer only from that project's knowledge, with citations.

- **Files:** pdf, docx, doc, pptx, xlsx, xls, csv, txt, md, json, js, ts, py, java, sql (max 10MB). Spreadsheets are indexed as labelled rows, so citations point to sheet + row range. Images are not OCR'd yet — the upload tells you so.
- **Links:** any public http(s) page (private/internal addresses are blocked).
- **Connectors (optional):** Jira, GitHub, Notion, Google Drive. Each one needs an OAuth app; without its keys the card shows "Not set up". Add the client ID/secret from `.env.example` and register this callback URL in the provider's console:
  `https://<your-domain>/api/connectors/<provider>/callback` (`<provider>` = `jira`, `github`, `notion`, `gdrive`; use `http://localhost:3000/...` for dev).
  All scopes are read-only; tokens are encrypted with `ENCRYPTION_KEY`.

## Wellness music

The Music corner ships with placeholder tracks. Add royalty-free audio (e.g. from Pixabay Audio / Free Music Archive) to `public/audio/` and set each track's `src` in `lib/wellness/music.ts` (e.g. `/audio/lofi-1.mp3`).

## Deployment (Vercel + custom domain)

1. **Vercel project:** import the repo → framework auto-detects Next.js.
2. **Environment variables** (Vercel → Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` *(server-only — never NEXT_PUBLIC)*
   - `GROQ_API_KEY`
   - `GEMINI_API_KEY`
   - `ENCRYPTION_KEY` *(32 random bytes base64 — `openssl rand -base64 32`)*
   - `NEXT_PUBLIC_OPEN_BETA` *("true" during the beta; "false" brings login back)*
   - `ADMIN_DASHBOARD_TOKEN` *(16+ random chars — unlocks the owner usage dashboard at `/admin`)*
   - Optional connector OAuth keys (`ATLASSIAN_*`, `GITHUB_*`, `NOTION_*`, `GOOGLE_*` — see `.env.example`)
3. **Custom domain:** Vercel → Domains → add `abhinova.theabhinavsaxena.in`, then at your DNS provider add a **CNAME**: `abhinova` → `cname.vercel-dns.com`.
4. **Supabase → Auth → URL Configuration:**
   - Site URL: `https://abhinova.theabhinavsaxena.in`
   - Redirect URLs: `https://abhinova.theabhinavsaxena.in/auth/callback` (keep the localhost one for dev).
5. **Google OAuth console:** add the production redirect (`https://<project-ref>.supabase.co/auth/v1/callback` stays the same; just verify the Supabase Site URL change).
6. Run `supabase/rls-verification.sql` checks after migrating, and note the
   guest-purge SQL documented at the bottom of `001_init.sql` (schedule it via
   pg_cron or run monthly).
7. Known limits on Vercel: uploads >4.5MB need the future direct-to-storage
   upload; WebContainers (Code Studio Run) require a Chromium browser.

## Project conventions

Folder structure, security rules and design tokens are documented in [`CLAUDE.md`](CLAUDE.md) — the rulebook every change follows. Database changes live in numbered migrations under [`supabase/migrations`](supabase/migrations).

---

Made by [Abhinav](https://github.com/Abhi-tech-geek) · [abhinova.theabhinavsaxena.in](https://abhinova.theabhinavsaxena.in)
