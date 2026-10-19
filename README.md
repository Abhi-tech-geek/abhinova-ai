# AbhiNova AI

A futuristic, productivity-first AI workspace — chat, QA tools, document intelligence, and a code studio, with an optional Wellness Mode.

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

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Framer Motion · Supabase (Postgres + Auth + Storage + pgvector) · Groq + Google Gemini · Recharts

See `CLAUDE.md` for project conventions and folder structure.
