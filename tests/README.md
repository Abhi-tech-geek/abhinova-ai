# Tests

| Folder | What | Needs |
|---|---|---|
| `unit/` | Pure logic: crisis keywords, script hint, URL guards, Local Mode switch | Nothing — runs in CI on every push |
| `e2e/` | Full suites against a running app (local or production) | `.env.local` with the service-role key; creates throwaway guests and deletes them |
| `tools/` | Owner reports: usage, feedback, abuse check (read-only, aggregates) | `.env.local` with the service-role key |

## Unit tests

```bash
npm run test:unit
```

## End-to-end suites

Start the app first (`npm run build` then `npm run start`, or `npm run dev`). Run from the project root:

```bash
node --import ./tests/e2e/xff.mjs tests/e2e/e2e-features.mjs .env.local http://localhost:3000 tests/out/e2e.json
```

| Script | Covers |
|---|---|
| `e2e-features.mjs` | ~110 checks: guest entry, every page, chat memory, all 8 QA tools, documents (incl. bad files), projects, Code Studio, wellness, feedback, admin |
| `audit-security.mjs` | IDOR between users, RLS on every table, storage, headers, secrets in client JS, admin brute force |
| `audit-ai.mjs` (+ `audit-ai-retry.mjs`) | Prompt leaks, jailbreaks, XSS echo, languages/scripts, date-time, injected documents, wellness crisis |
| `ai-busy-test.mjs` | Every AI route when all providers fail (start the app with bogus GROQ/GEMINI keys) |
| `privacy-test.mjs` | `/privacy`, sidebar link, mode banner, "Delete my data" isolation |
| `rpc-isolation-test.mjs` | Vector-search RPC can't return another user's chunks |
| `modes-test.mjs` | Funny/odd questions in every mode + a deep project test |
| `local-mode-test.mjs` + `mock-ollama.mjs` | Local Mode against a fake Ollama (start the app with `OLLAMA_URL=http://localhost:11555`) |
| `real-local-test.mjs` | Local Mode against a real Ollama |

`xff.mjs` (preload) gives each run its own fake client IP on **localhost only**, so the per-IP beta quota of earlier runs doesn't block it, and waits when Supabase rate-limits anonymous sign-ups (about 30/hour per IP). It has no effect on Vercel.

AI suites use real model calls: on production they count against the beta quotas of your network.
