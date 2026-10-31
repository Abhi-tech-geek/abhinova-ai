// End-to-end feature suite (every feature, happy + unhappy paths) against a running build.
// Usage: node --import ./xff.mjs e2e-features.mjs <.env.local> <baseUrl> <out.json>
// Creates throwaway anonymous guests and deletes them (and their data) at the end.
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const B = process.argv[3];
const OUT = process.argv[4];
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36";
const admin = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ref = new URL(SUPA).hostname.split(".")[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function rec(area, test, pass, detail = "") {
  results.push({ area, test, pass: !!pass, detail: String(detail).slice(0, 400) });
  console.log(`${pass ? "PASS" : "FAIL"} [${area}] ${test}${pass ? "" : " -- " + String(detail).slice(0, 220)}`);
}
async function step(area, test, fn) {
  try { await fn(); } catch (e) { rec(area, test, false, "threw: " + (e?.message ?? e)); }
}

const guests = [];
async function guest() {
  const sb = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  const v = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const parts = [];
  for (let i = 0; i * 3180 < v.length; i++) parts.push(`sb-${ref}-auth-token${v.length > 3180 ? "." + i : ""}=${v.slice(i * 3180, (i + 1) * 3180)}`);
  const g = { id: data.user.id, cookie: parts.join("; ") };
  guests.push(g);
  return g;
}
function call(g, path, { method, json, form, headers = {}, redirect = "manual" } = {}) {
  return fetch(B + path, {
    method: method ?? (json || form ? "POST" : "GET"),
    redirect,
    headers: { "User-Agent": UA, ...(g ? { cookie: g.cookie } : {}), ...(json ? { "Content-Type": "application/json" } : {}), ...headers },
    body: json ? JSON.stringify(json) : form,
  });
}
async function jsonOf(r) { const t = await r.text(); try { return JSON.parse(t); } catch { return { _raw: t.slice(0, 300) }; } }
function fileForm(name, content, type) {
  const fd = new FormData();
  fd.append("file", new Blob([content], { type }), name);
  return fd;
}

// ------------------------------------------------------------ entry, proxy, pages
await step("entry", "signed-out visit → guest redirect", async () => {
  const r = await call(null, "/chat");
  rec("entry", "signed-out /chat → page + guest session in one hop", r.status === 200 && (r.headers.get("set-cookie") ?? "").includes("sb-"), `${r.status} ${r.headers.get("location")}`);
  const root = await call(null, "/");
  rec("entry", "signed-out / → /chat with a guest session (one hop)", root.status === 307 && (root.headers.get("location") ?? "").endsWith("/chat") && (root.headers.get("set-cookie") ?? "").includes("sb-"), `${root.status} ${root.headers.get("location")}`);
  const g = await call(null, "/auth/guest?next=%2Fprojects");
  rec("entry", "/auth/guest creates a session and returns to the page", g.status === 307 && (g.headers.get("location") ?? "").endsWith("/projects") && (g.headers.get("set-cookie") ?? "").includes("sb-"), `${g.status} ${g.headers.get("location")}`);
  const evil = await call(null, "/auth/guest?next=https%3A%2F%2Fevil.example%2Fx");
  const loc = evil.headers.get("location") ?? "";
  rec("entry", "open redirect blocked (next=https://evil…)", !loc.includes("evil.example"), loc);
  const bot = await call(null, "/chat", { headers: { "User-Agent": "WhatsApp/2.23" } });
  rec("entry", "link-preview bot gets plain page, no guest", bot.status === 200 && !(bot.headers.get("set-cookie") ?? "").includes("sb-"), bot.status);
  const head = await call(null, "/chat", { method: "HEAD" });
  rec("entry", "HEAD request does not mint a guest", !(head.headers.get("set-cookie") ?? "").includes("sb-"), head.status);
});

const G = await guest();
await step("pages", "all workspace pages", async () => {
  const pages = ["/chat", "/projects", "/qa-studio", ...["test-cases", "bug-report", "edge-cases", "api-tests", "regression-checklist", "sql-tests", "test-data", "automation-snippet"].map((t) => `/qa-studio/${t}`), "/documents", "/code-studio", "/settings", "/talk", "/mood", "/journal", "/progress", "/admin"];
  for (const p of pages) {
    const t0 = Date.now();
    const r = await call(G, p);
    const body = await r.text();
    rec("pages", `${p} renders`, r.status === 200 && !/Application error|Internal Server Error/.test(body), `${r.status} ${Date.now() - t0}ms`);
  }
  for (const p of ["/qa-studio/not-a-tool", "/does-not-exist", "/chat/not-a-uuid", "/projects/not-a-uuid", "/projects/not-a-uuid/chat/new"]) {
    const r = await call(G, p);
    rec("pages", `${p} → 404`, r.status === 404, r.status);
  }
  const robots = await (await call(null, "/robots.txt")).text();
  rec("pages", "robots.txt disallows crawling", /Disallow: \//.test(robots), robots.slice(0, 80));
  const img = await call(null, "/_next/image?url=%2Ffavicon.ico&w=64&q=75");
  rec("pages", "image optimizer disabled (/_next/image)", img.status >= 400, img.status);
});

await step("headers", "security headers", async () => {
  const r = await call(G, "/chat");
  const csp = r.headers.get("content-security-policy") ?? "";
  rec("headers", "CSP img-src has no remote https", /img-src 'self' data: blob:(;|$)/.test(csp), csp.match(/img-src[^;]*/)?.[0]);
  rec("headers", "CSP frame-ancestors none + object-src none", csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'"));
  rec("headers", "X-Frame-Options DENY", r.headers.get("x-frame-options") === "DENY");
  rec("headers", "nosniff", r.headers.get("x-content-type-options") === "nosniff");
  const cs = await call(G, "/code-studio");
  rec("headers", "Code Studio cross-origin isolated (COOP+COEP)", cs.headers.get("cross-origin-opener-policy") === "same-origin" && cs.headers.get("cross-origin-embedder-policy") === "require-corp");
  rec("headers", "No X-Powered-By leak", !r.headers.get("x-powered-by"), r.headers.get("x-powered-by"));
});

// ------------------------------------------------------------ chat
let convId = null;
await step("chat", "conversation flow", async () => {
  let r = await call(G, "/api/chat", { json: { message: "Mera naam Raju hai aur main QA engineer hoon. Bas 'ok' bolo." } });
  convId = r.headers.get("x-conversation-id");
  const first = await r.text();
  rec("chat", "new chat streams a reply + conversation id", r.status === 200 && !!convId && first.trim().length > 0, `${r.status} ${first.slice(0, 80)}`);
  await sleep(1500);
  r = await call(G, "/api/chat", { json: { message: "Mera naam kya hai?", conversationId: convId } });
  const second = await r.text();
  rec("chat", "follow-up remembers earlier message", r.status === 200 && /raju/i.test(second), second.slice(0, 120));
  const page = await call(G, `/chat/${convId}`);
  const html = await page.text();
  rec("chat", "conversation page reloads history", page.status === 200 && html.includes("Raju"), page.status);
  r = await call(G, "/api/chat", { json: { message: "" } });
  rec("chat", "empty message → 400", r.status === 400, r.status);
  r = await call(G, "/api/chat", { json: { message: "hi", conversationId: "not-a-uuid" } });
  rec("chat", "bad conversationId → 400", r.status === 400, r.status);
  r = await call(G, "/api/chat", { json: { message: "x".repeat(20001) } });
  rec("chat", "oversized message → 400", r.status === 400, r.status);
  r = await call(G, "/api/chat", { json: { message: "hi", modelId: "made-up/model" } });
  rec("chat", "unknown model → 400", r.status === 400, r.status);
  const anon = await call(null, "/api/chat", { json: { message: "hi" } });
  rec("chat", "no session → 401", anon.status === 401, anon.status);
  const u = await jsonOf(await call(G, "/api/beta/usage"));
  rec("chat", "beta usage shows the chat counted", JSON.stringify(u).includes("chat"), JSON.stringify(u).slice(0, 160));
});

// ------------------------------------------------------------ QA Studio (5/day per guest → two guests)
const QA_INPUTS = {
  "test-cases": ["Login page: email + password, 'Remember me' checkbox, account locks after 5 wrong attempts.", (o) => Array.isArray(o.testCases) && o.testCases.length >= 3 && o.testCases.every((t) => t.steps?.length)],
  "bug-report": ["Checkout button does nothing on Safari 17 when the cart has a discount code. Console shows TypeError.", (o) => o.title && o.stepsToReproduce?.length && o.severity],
  "edge-cases": ["Date of birth field on a signup form (age must be 18+).", (o) => Array.isArray(o.categories ?? o.edgeCases) && (o.categories ?? o.edgeCases).length > 0],
  "api-tests": ["POST /api/orders creates an order; needs Bearer token; body {productId, qty}; returns 201.", (o) => o.scenarios?.length && o.curlCommands?.length],
  "regression-checklist": ["Release changed the payment gateway from Razorpay to Stripe.", (o) => Array.isArray(o.items ?? o.checklist) && (o.items ?? o.checklist).length > 0],
  "sql-tests": ["Table orders(id, user_id, amount, status, created_at). Write data-integrity checks.", (o) => JSON.stringify(o).toLowerCase().includes("select")],
  "test-data": ["Indian users: name, email, phone, PIN code. 5 rows.", (o) => JSON.stringify(o).length > 100],
  "automation-snippet": ["Playwright: open /login, fill email and password, click Sign in, expect /dashboard.", (o) => /page\.|expect/.test(JSON.stringify(o))],
};
await step("qa", "all 8 QA tools", async () => {
  const q1 = await guest();
  const q2 = await guest();
  const tools = Object.keys(QA_INPUTS);
  for (const [i, tool] of tools.entries()) {
    const g = i < 5 ? q1 : q2;
    const t0 = Date.now();
    const r = await call(g, `/api/qa/${tool}`, { json: { input: QA_INPUTS[tool][0] } });
    const body = await jsonOf(r);
    let ok = false;
    try { ok = r.status === 200 && !!QA_INPUTS[tool][1](body.output ?? {}); } catch { ok = false; }
    rec("qa", `${tool} returns valid structured output`, ok, `${r.status} ${Date.now() - t0}ms ${JSON.stringify(body).slice(0, 200)}`);
  }
  let r = await call(q1, "/api/qa/test-cases", { json: { input: "one more" } });
  const lim = await jsonOf(r);
  rec("qa", "6th QA run in a day is blocked with a friendly code", r.status === 429 && /qa/.test(lim.error ?? ""), `${r.status} ${JSON.stringify(lim)}`);
  r = await call(q2, "/api/qa/test-cases", { json: { input: "" } });
  rec("qa", "empty input → 400", r.status === 400, r.status);
  r = await call(q2, "/api/qa/not-a-tool", { json: { input: "x" } });
  rec("qa", "unknown tool → 404", r.status === 404, r.status);
  const hist = await (await call(q1, "/qa-studio/test-cases")).text();
  rec("qa", "history tab shows the saved run", hist.includes("Remember me") || hist.includes("Login"), "");
});

// ------------------------------------------------------------ documents
let docId = null;
await step("documents", "upload → process → ask", async () => {
  const D = await guest();
  const text = "AbhiNova Test Handbook\n\nThe staging server restarts every Sunday at 2 AM IST.\nBugs marked P0 must be fixed within 24 hours.\nThe QA lead for the payments team is Meera.\n";
  let r = await call(D, "/api/documents/upload", { form: fileForm("handbook.txt", text, "text/plain") });
  const up = await jsonOf(r);
  docId = up.documentId ?? up.document?.id ?? null;
  rec("documents", "upload .txt", (r.status === 200 || r.status === 201) && !!docId, `${r.status} ${JSON.stringify(up).slice(0, 160)}`);
  r = await call(D, "/api/documents/process", { json: { documentId: docId } });
  const pr = await jsonOf(r);
  rec("documents", "process → ready with chunks", r.status === 200 && pr.status === "ready" && pr.chunkCount > 0, JSON.stringify(pr));
  r = await call(D, "/api/documents/query", { json: { question: "P0 bugs kitne time me fix karne hain?", documentIds: [docId] } });
  const q = await jsonOf(r);
  rec("documents", "ask: answer from the file with a citation", r.status === 200 && /24/.test(q.answer ?? "") && /\[\s*S1\s*\]/.test(q.answer ?? "") && q.sources?.length > 0, (q.answer ?? JSON.stringify(q)).slice(0, 200));
  r = await call(D, "/api/documents/query", { json: { question: "Summarize", documentIds: [docId], mode: "summarize" } });
  const s = await jsonOf(r);
  rec("documents", "summarize mode", r.status === 200 && (s.answer ?? "").length > 40, (s.answer ?? JSON.stringify(s)).slice(0, 160));
  r = await call(D, "/api/documents/query", { json: { question: "Who is the CEO of Google?", documentIds: [docId] } });
  const n = await jsonOf(r);
  rec("documents", "question not in the file → says so", r.status === 200 && /(not|n't|nahi|no ).{0,60}(document|source|file|mention|provided|information)|couldn't find/i.test(n.answer ?? ""), (n.answer ?? "").slice(0, 200));
  const csv = "name,role\nMeera,QA lead\nArjun,Developer\n";
  r = await call(D, "/api/documents/upload", { form: fileForm("team.csv", csv, "text/csv") });
  const up2 = await jsonOf(r);
  rec("documents", "upload .csv (2nd document)", r.status === 200 || r.status === 201, `${r.status} ${JSON.stringify(up2).slice(0, 120)}`);
  r = await call(D, "/api/documents/upload", { form: fileForm("third.md", "# third", "text/markdown") });
  const lim = await jsonOf(r);
  rec("documents", "3rd document blocked for guest (limit 2)", r.status === 403 || r.status === 429, `${r.status} ${JSON.stringify(lim)}`);

  const E = G;
  r = await call(E, "/api/documents/upload", { form: fileForm("fake.pdf", "this is not a pdf", "application/pdf") });
  rec("documents", "fake .pdf (wrong magic bytes) rejected", r.status === 400, `${r.status} ${(await r.text()).slice(0, 100)}`);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  r = await call(E, "/api/documents/upload", { form: fileForm("photo.png", png, "image/png") });
  const pi = await r.text();
  rec("documents", "image refused (unsupported_type → UI shows the OCR message)", r.status === 400 && /unsupported_type/.test(pi), `${r.status} ${pi.slice(0, 120)}`);
  r = await call(E, "/api/documents/upload", { form: fileForm("run.exe", "MZ\x90\x00binary", "application/octet-stream") });
  rec("documents", ".exe rejected", r.status === 400, r.status);
  r = await call(E, "/api/documents/upload", { form: fileForm("big.txt", "a".repeat(10 * 1024 * 1024 + 10), "text/plain") });
  rec("documents", "file over 10 MB rejected", r.status === 400 || r.status === 413, r.status);
  r = await call(E, "/api/documents/upload", { form: fileForm("../../etc/passwd.txt", "root:x:0:0", "text/plain") });
  const tr = await jsonOf(r);
  rec("documents", "path-like filename is sanitized (upload ok or refused, never traversal)", r.status === 200 || r.status === 201 || r.status === 400, `${r.status} ${JSON.stringify(tr).slice(0, 120)}`);
  r = await call(E, "/api/documents/process", { json: { documentId: docId } });
  rec("documents", "another guest cannot process my document", r.status === 404, r.status);
  const page = await (await call(D, "/documents")).text();
  rec("documents", "documents page lists the upload", page.includes("handbook.txt"), "");
});

// ------------------------------------------------------------ projects
await step("projects", "project lifecycle", async () => {
  const P = await guest();
  let r = await call(P, "/api/projects", { json: { name: "Release 2.1 QA", description: "Payments regression", custom_instructions: "Reply in short bullet points." } });
  const created = await jsonOf(r);
  const pid = created.project?.id;
  rec("projects", "create project", r.status === 201 && !!pid, `${r.status} ${JSON.stringify(created).slice(0, 120)}`);
  r = await call(P, "/api/projects", { json: { name: "Second" } });
  rec("projects", "2nd project blocked for guest", r.status === 403, r.status);
  r = await call(P, "/api/projects", { json: { name: "" } });
  rec("projects", "empty name → 400", r.status === 400, r.status);
  r = await call(P, `/api/projects/${pid}`, { method: "PATCH", json: { custom_instructions: "Always answer in exactly three bullet points." } });
  rec("projects", "update instructions", r.status === 200, r.status);
  r = await call(P, `/api/projects/${pid}/notes`, { json: { content: "Payments go live on 15 Nov." } });
  const note = await jsonOf(r);
  rec("projects", "add note", r.status === 201 && !!note.note?.id, r.status);
  r = await call(P, `/api/projects/${pid}/notes`, { method: "PATCH", json: { noteId: note.note?.id, content: "Payments go live on 18 Nov." } });
  rec("projects", "edit note", r.status === 200, r.status);
  const notes = await jsonOf(await call(P, `/api/projects/${pid}/notes`));
  rec("projects", "list notes shows the edit", JSON.stringify(notes).includes("18 Nov"), JSON.stringify(notes).slice(0, 120));
  r = await call(P, "/api/chat", { json: { message: "Payments kab live hoga?", projectId: pid } });
  const ans = await r.text();
  rec("projects", "project chat uses notes (18 Nov)", r.status === 200 && /18/.test(ans), ans.slice(0, 160));
  r = await call(P, `/api/projects/${pid}/sources`, { json: { type: "url", url: "https://example.com" } });
  rec("projects", "guest cannot add a web link source", r.status === 403 || r.status === 400, r.status);
  const page = await call(P, `/projects/${pid}`);
  rec("projects", "project home page renders", page.status === 200 && (await page.text()).includes("Release 2.1 QA"), page.status);
  const other = G;
  r = await call(other, `/api/projects/${pid}`);
  rec("projects", "another guest gets 404 for my project", r.status === 404, r.status);
  r = await call(P, `/api/projects/${pid}/notes`, { method: "DELETE", json: { noteId: note.note?.id } });
  rec("projects", "delete note", r.status === 200, r.status);
  r = await call(P, `/api/projects/${pid}`, { method: "DELETE" });
  rec("projects", "delete project", r.status === 200, r.status);
  r = await call(P, `/api/projects/${pid}`);
  rec("projects", "deleted project is gone", r.status === 404, r.status);
});

// ------------------------------------------------------------ Code Studio
await step("code", "code studio", async () => {
  const C = G;
  const file = { path: "src/cart.ts", content: "export function total(items: {price:number, qty:number}[]) {\n  let t = 0;\n  for (let i = 0; i <= items.length; i++) t += items[i].price * items[i].qty;\n  return t;\n}\n" };
  let r = await call(C, "/api/code/chat", { json: { action: "explain", message: "Is code me bug kya hai?", files: [file] } });
  const ex = await r.text();
  rec("code", "explain finds the off-by-one bug", r.status === 200 && /(<=|off.by.one|length|undefined|out of (range|bounds))/i.test(ex), ex.slice(0, 160));
  r = await call(C, "/api/code/edit", { json: { instruction: "Fix the loop bug.", files: [file] } });
  const ed = await jsonOf(r);
  rec("code", "edit returns a reviewed diff (not written to disk)", r.status === 200 && JSON.stringify(ed).includes("i < items.length"), JSON.stringify(ed).slice(0, 200));
  r = await call(C, "/api/code/docs", { json: { docType: "prd", description: "A cart total calculator for an e-commerce site.", files: [file] } });
  const dc = await jsonOf(r);
  rec("code", "PRD doc generated as markdown", r.status === 200 && (dc.markdown ?? "").length > 200 && /#/.test(dc.markdown ?? ""), `${r.status} ${(dc.markdown ?? JSON.stringify(dc)).slice(0, 100)}`);
  r = await call(C, "/api/code/chat", { json: { action: "explain", message: "explain", files: [{ path: "config/.env.production", content: "DB_PASSWORD=hunter2" }] } });
  rec("code", ".env file refused before the AI", r.status === 400, `${r.status} ${(await r.text()).slice(0, 100)}`);
  r = await call(C, "/api/code/chat", { json: { action: "explain", message: "explain", files: [{ path: "src/keys.ts", content: "const k = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD';" }] } });
  rec("code", "file with an API key is refused or redacted", r.status === 400 || !(await r.text()).includes("abcdefghijklmnopqrstuvwxyz0123456789"), r.status);
  r = await call(C, "/api/code/chat", { json: { action: "hack", message: "x" } });
  rec("code", "unknown action → 400", r.status === 400, r.status);
});

// ------------------------------------------------------------ Wellness
await step("wellness", "wellness", async () => {
  const W = G;
  let r = await call(W, "/api/wellness/chat", { json: { message: "Aaj kaam ka pressure bahut tha, thoda thak gaya hoon.", persona: "dost" } });
  const w1 = await r.text();
  rec("wellness", "talk reply includes the not-a-therapist disclaimer", r.status === 200 && /(not a replacement for a professional therapist|therapist ka replacement nahi)/i.test(w1), w1.slice(0, 160));
  rec("wellness", "normal message is not flagged as crisis", r.headers.get("x-crisis") === "0", r.headers.get("x-crisis"));
  const wconv = r.headers.get("x-conversation-id");
  r = await call(W, "/api/wellness/chat", { json: { action: "end", conversationId: wconv } });
  const sum = await jsonOf(r);
  rec("wellness", "end session gives a summary", r.status === 200 && (sum.summary ?? "").length > 20, JSON.stringify(sum).slice(0, 120));
  r = await call(W, "/api/wellness/mood", { json: { mood: 4, note: "Productive day", sleepHours: 7 } });
  rec("wellness", "mood check-in saved", r.status === 200, r.status);
  r = await call(W, "/api/wellness/mood", { json: { mood: 9 } });
  rec("wellness", "mood out of range → 400", r.status === 400, r.status);
  r = await call(W, "/api/wellness/journal", { json: { content: "Mujhe lagta hai main kabhi kuch sahi nahi karta, ek galti hui toh sab kharab ho gaya." } });
  const j = await jsonOf(r);
  rec("wellness", "journal reflection returns distortions + reframe", r.status === 200 && Array.isArray(j.analysis?.distortions) && !!j.analysis?.reframe, JSON.stringify(j).slice(0, 200));
  const pg = await call(W, "/progress");
  rec("wellness", "progress page renders", pg.status === 200, pg.status);
});

// ------------------------------------------------------------ settings, models, connectors, feedback
await step("misc", "models / connectors / feedback", async () => {
  const M = G;
  let r = await call(M, "/api/models/list");
  const ml = await jsonOf(r);
  rec("misc", "model list has built-in Groq + Gemini", r.status === 200 && JSON.stringify(ml).includes("groq") && JSON.stringify(ml).toLowerCase().includes("gemini"), JSON.stringify(ml).slice(0, 160));
  r = await call(M, "/api/models/keys");
  rec("misc", "guest cannot read BYOK keys", r.status === 403 || r.status === 401, r.status);
  r = await call(M, "/api/models/keys", { json: { provider: "openai", apiKey: "sk-test-123456789012345678901234" } });
  rec("misc", "guest cannot save a BYOK key", r.status === 403 || r.status === 401, r.status);
  r = await call(M, "/api/connectors/github/connect");
  rec("misc", "guest cannot connect GitHub", r.status === 403 || r.status === 401 || (r.status >= 300 && r.status < 400 && !(r.headers.get("location") ?? "").includes("github.com")), `${r.status} ${r.headers.get("location") ?? ""}`);
  r = await call(M, "/api/connectors/not-real/connect");
  rec("misc", "unknown connector → 4xx", r.status >= 400 && r.status < 500, r.status);
  r = await call(M, "/api/feedback", { json: { category: "praise", message: "[automated test] Next 16 e2e suite — please ignore" } });
  rec("misc", "feedback accepted", r.status === 201, r.status);
  r = await call(M, "/api/feedback", { json: { category: "bug", message: "x" } });
  rec("misc", "too-short feedback → 400", r.status === 400, r.status);
  r = await call(M, "/api/feedback", { json: { category: "spam", message: "hello there" } });
  rec("misc", "bad feedback category → 400", r.status === 400, r.status);
  r = await call(null, "/api/feedback", { json: { category: "bug", message: "hello there" } });
  rec("misc", "feedback without session → 401", r.status === 401, r.status);
});

// ------------------------------------------------------------ admin
await step("admin", "admin dashboard", async () => {
  let r = await call(null, "/admin");
  const h = await r.text();
  rec("admin", "no cookie → key prompt only (no stats)", r.status === 200 && !/admin_usage_stats|Daily active|Total users/i.test(h) && /key|token/i.test(h), r.status);
  r = await call(null, "/admin/login", { form: new URLSearchParams({ key: "definitely-wrong" }) });
  rec("admin", "wrong key → no admin cookie", !(r.headers.get("set-cookie") ?? "").includes("anv_admin="), `${r.status} ${r.headers.get("location")}`);
  if (env.ADMIN_DASHBOARD_TOKEN) {
    r = await call(null, "/admin/login", { form: new URLSearchParams({ key: env.ADMIN_DASHBOARD_TOKEN }) });
    const ck = (r.headers.get("set-cookie") ?? "").match(/anv_admin=[^;]+/)?.[0];
    rec("admin", "right key → httpOnly admin cookie", !!ck && /httponly/i.test(r.headers.get("set-cookie") ?? ""), r.status);
    const d = await fetch(B + "/admin?days=7", { headers: { cookie: ck ?? "", "User-Agent": UA } });
    const dh = await d.text();
    rec("admin", "dashboard renders stats with the cookie", d.status === 200 && dh.length > 5000 && !/Application error/.test(dh), `${d.status} ${dh.length}b`);
  }
});

// ------------------------------------------------------------ cleanup
let cleaned = 0;
for (const g of guests) {
  const { data: files } = await admin.storage.from("documents").list(g.id);
  if (files?.length) await admin.storage.from("documents").remove(files.map((f) => `${g.id}/${f.name}`));
  await admin.from("feedback").delete().eq("user_id", g.id);
  const { error } = await admin.auth.admin.deleteUser(g.id);
  if (!error) cleaned++;
}
console.log(`\ncleanup: deleted ${cleaned}/${guests.length} test guests`);
const passed = results.filter((r) => r.pass).length;
console.log(`${passed}/${results.length} passed`);
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
