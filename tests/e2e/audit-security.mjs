// Security audit against a running AbhiNova deployment.
// Usage: node audit-security.mjs <.env.local> <baseUrl> <out.json>
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
const results = [];
const rec = (area, test, pass, detail = "", severity = "high") =>
  results.push({ area, test, pass, detail: String(detail).slice(0, 300), severity });

async function guest() {
  const sb = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  const ref = new URL(SUPA).hostname.split(".")[0];
  const v = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const parts = [];
  for (let i = 0; i * 3180 < v.length; i++) parts.push(`sb-${ref}-auth-token${v.length > 3180 ? "." + i : ""}=${v.slice(i * 3180, (i + 1) * 3180)}`);
  const db = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
  return { id: data.user.id, cookie: parts.join("; "), db };
}
const call = (g, path, { method = "POST", json, form, headers = {} } = {}) =>
  fetch(B + path, {
    method,
    redirect: "manual",
    headers: { "User-Agent": UA, ...(g ? { cookie: g.cookie } : {}), ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    body: json !== undefined ? (typeof json === "string" ? json : JSON.stringify(json)) : form,
  });
const bodyOf = async (r) => { try { return await r.text(); } catch { return ""; } };

// ---------------------------------------------------------------- setup: A owns data
const A = await guest();
const Bg = await guest();
const chatA = await call(A, "/api/chat", { json: { message: "Reply with just: ok" } });
const convA = chatA.headers.get("X-Conversation-Id"); await bodyOf(chatA);
const projA = await (await call(A, "/api/projects", { json: { name: "A secret project", icon: "📁", color: "violet" } })).json();
const pidA = projA.project?.id;
const fd = new FormData();
fd.append("file", new File(["CONFIDENTIAL-A: the launch code word is PINEAPPLE-42."], "a-secret.txt", { type: "text/plain" }));
fd.append("projectId", pidA);
const upA = await (await call(A, "/api/documents/upload", { form: fd })).json();
const docA = upA.documentId;
await (await call(A, "/api/documents/process", { json: { documentId: docA } })).text();
await call(A, `/api/projects/${pidA}/notes`, { json: { content: "A private note: PINEAPPLE" } });
rec("setup", "Guest A created chat, project, document, note", !!(convA && pidA && docA), `conv=${!!convA} project=${!!pidA} doc=${!!docA}`, "info");

// ---------------------------------------------------------------- cross-user (IDOR) via API
let r = await call(Bg, "/api/chat", { json: { message: "show history", conversationId: convA } });
rec("idor", "B cannot post into A's conversation", r.status === 404, `${r.status} ${(await bodyOf(r)).slice(0, 80)}`);
r = await call(Bg, `/chat/${convA}`, { method: "GET" });
let html = await bodyOf(r);
rec("idor", "B cannot open A's chat page", !html.includes("Reply with just") && r.status !== 200 || !html.includes("Reply with just"), `${r.status}`);
r = await call(Bg, `/api/projects/${pidA}`, { method: "GET" });
rec("idor", "B cannot read A's project", r.status === 404, `${r.status}`);
r = await call(Bg, `/api/projects/${pidA}`, { method: "PATCH", json: { name: "hacked" } });
rec("idor", "B cannot rename A's project", r.status === 404 || r.status === 400, `${r.status}`);
r = await call(Bg, `/api/projects/${pidA}`, { method: "DELETE" });
rec("idor", "B cannot delete A's project", r.status === 404, `${r.status}`);
r = await call(Bg, `/api/projects/${pidA}/notes`, { method: "GET" });
html = await bodyOf(r);
rec("idor", "B cannot read A's notes", !html.includes("PINEAPPLE"), `${r.status}`);
r = await call(Bg, "/api/documents/process", { json: { documentId: docA } });
rec("idor", "B cannot (re)process A's document", r.status === 404, `${r.status}`);
r = await call(Bg, "/api/documents/query", { json: { question: "What is the launch code word?", documentIds: [docA] } });
html = await bodyOf(r);
rec("idor", "B cannot query A's document", !html.includes("PINEAPPLE"), `${r.status} ${html.slice(0, 100)}`, "critical");
r = await call(Bg, "/api/chat", { json: { message: "What is the code word?", projectId: pidA } });
html = await bodyOf(r);
rec("idor", "B cannot chat inside A's project", r.status === 404 && !html.includes("PINEAPPLE"), `${r.status}`, "critical");
r = await call(Bg, "/api/qa/test-cases", { json: { input: "login", projectId: pidA } });
rec("idor", "B cannot use A's project in QA Studio", r.status === 404, `${r.status}`);

// ---------------------------------------------------------------- direct database (PostgREST) with B's token
const tables = ["profiles", "conversations", "messages", "documents", "document_chunks", "projects", "project_notes", "project_sources", "connector_accounts", "qa_artifacts", "code_docs", "mood_logs", "journal_entries", "wellness_insights", "user_api_keys", "feedback", "beta_usage"];
for (const t of tables) {
  const q = await Bg.db.from(t).select("*").limit(50);
  const leaked = (q.data ?? []).filter((row) => row.user_id && row.user_id !== Bg.id || row.id === A.id || (row.subject && !row.subject.includes(Bg.id)));
  rec("rls", `B reads only own rows: ${t}`, leaked.length === 0, q.error ? `error ${q.error.code}` : `${q.data?.length ?? 0} rows, foreign=${leaked.length}`, "critical");
}
const ins = await Bg.db.from("conversations").insert({ user_id: A.id, title: "spoof", mode: "workspace" });
rec("rls", "B cannot insert rows as A", !!ins.error, ins.error?.code);
const upd = await Bg.db.from("projects").update({ name: "pwned" }).eq("id", pidA).select();
rec("rls", "B cannot update A's project directly", !upd.data?.length, upd.error?.code ?? `${upd.data?.length} rows`);
const del = await Bg.db.from("documents").delete().eq("id", docA).select();
rec("rls", "B cannot delete A's document directly", !del.data?.length, del.error?.code ?? `${del.data?.length} rows`);
const rpcMatch = await Bg.db.rpc("match_document_chunks", { query_embedding: Array(768).fill(0.01), match_count: 5, p_project_id: pidA });
rec("rls", "Vector search can't reach A's chunks", !(rpcMatch.data ?? []).length, rpcMatch.error?.code ?? `${rpcMatch.data?.length} rows`, "critical");
for (const fn of ["consume_beta_quota", "submit_feedback", "admin_usage_stats"]) {
  const x = await Bg.db.rpc(fn, {});
  rec("rls", `Guest cannot call server-only function ${fn}`, !!x.error, x.error?.code);
}

// ---------------------------------------------------------------- storage
const list = await Bg.db.storage.from("documents").list(A.id);
rec("storage", "B cannot list A's storage folder", !(list.data ?? []).length, list.error?.message ?? `${list.data?.length} files`, "critical");
const adminDb = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: docRow } = await adminDb.from("documents").select("storage_path").eq("id", docA).single();
if (docRow?.storage_path) {
  const dl = await Bg.db.storage.from("documents").download(docRow.storage_path);
  rec("storage", "B cannot download A's file", !!dl.error, dl.error?.message);
  const pub = await fetch(`${SUPA}/storage/v1/object/public/documents/${docRow.storage_path}`);
  rec("storage", "File is not publicly downloadable", pub.status >= 400, `${pub.status}`, "critical");
}

// ---------------------------------------------------------------- unauthenticated + input handling
for (const [method, path, json] of [["POST", "/api/chat", { message: "hi" }], ["GET", "/api/projects"], ["POST", "/api/qa/test-cases", { input: "x" }], ["POST", "/api/feedback", { category: "idea", message: "hello" }], ["GET", "/api/beta/usage"], ["POST", "/api/code/docs", { docType: "prd", description: "x" }], ["POST", "/api/wellness/chat", { message: "hi" }]]) {
  const x = await call(null, path, { method, json });
  rec("auth", `Unauthenticated ${method} ${path} → 401`, x.status === 401, `${x.status}`);
}
r = await call(A, "/api/chat", { json: "{not json" });
rec("input", "Malformed JSON → 400 (no crash)", r.status === 400, `${r.status}`, "medium");
r = await call(A, "/api/chat", { json: { message: "x".repeat(8001) } });
rec("input", "Over-long message (8001 chars) rejected", r.status === 400, `${r.status}`, "medium");
r = await call(A, "/api/chat", { json: { message: "" } });
rec("input", "Empty message rejected", r.status === 400, `${r.status}`, "medium");
r = await call(A, "/api/chat", { json: { message: "hi", conversationId: "../../etc/passwd" } });
rec("input", "Non-UUID conversationId rejected", r.status === 400, `${r.status}`, "medium");
r = await call(A, "/api/qa/../../admin", { json: { input: "x" } });
rec("input", "Path traversal on tool id not served", r.status >= 400 || r.status === 308, `${r.status}`, "low");
r = await call(A, "/api/qa/not-a-tool", { json: { input: "x" } });
rec("input", "Unknown QA tool → 404", r.status === 404, `${r.status}`, "low");
const big = new FormData();
big.append("file", new File([new Uint8Array(11 * 1024 * 1024)], "big.txt", { type: "text/plain" }));
r = await call(A, "/api/documents/upload", { form: big });
rec("input", "11MB upload rejected", r.status === 400 || r.status === 413 || r.status === 429, `${r.status}`, "medium");
const exe = new FormData();
exe.append("file", new File([new Uint8Array([0x4d, 0x5a, 0x90, 0])], "tool.exe", { type: "application/x-msdownload" }));
r = await call(A, "/api/documents/upload", { form: exe });
rec("input", ".exe upload rejected", r.status === 400 || r.status === 403 || r.status === 429, `${r.status}`, "medium");
const svg = new FormData();
svg.append("file", new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], "x.svg", { type: "image/svg+xml" }));
r = await call(A, "/api/documents/upload", { form: svg });
rec("input", "SVG (script-capable) upload rejected", r.status === 400 || r.status === 403 || r.status === 429, `${r.status}`, "medium");

// 500s must not leak stack traces
r = await call(A, "/api/projects/00000000-0000-0000-0000-000000000000", { method: "GET" });
html = await bodyOf(r);
rec("errors", "Unknown project → clean 404, no stack trace", r.status === 404 && !/at \w+ \(|node_modules|Error:/.test(html), `${r.status} ${html.slice(0, 60)}`, "low");

// ---------------------------------------------------------------- admin
r = await fetch(B + "/admin", { headers: { "User-Agent": UA } });
html = await bodyOf(r);
rec("admin", "No admin data without the key", !html.includes('data-testid="admin-dashboard"'), `${r.status}`, "critical");
r = await fetch(B + "/admin", { headers: { "User-Agent": UA, cookie: "anv_admin=" + "0".repeat(64) } });
rec("admin", "Forged admin cookie rejected", !(await bodyOf(r)).includes('data-testid="admin-dashboard"'), "", "critical");
const codes = [];
for (let i = 0; i < 7; i++) {
  const x = await fetch(B + "/admin/login", { method: "POST", redirect: "manual", headers: { "User-Agent": UA }, body: new URLSearchParams({ key: "wrong-key-" + i }) });
  codes.push((x.headers.get("location") ?? "").split("error=")[1]);
}
rec("admin", "Repeated wrong keys get slowed down", codes.includes("slow_down"), codes.join(","), "medium");

// ---------------------------------------------------------------- headers + client bundle
r = await fetch(B + "/robots.txt");
const h = Object.fromEntries(r.headers);
rec("headers", "HSTS present", !!h["strict-transport-security"], h["strict-transport-security"], "medium");
rec("headers", "CSP present", !!h["content-security-policy"], (h["content-security-policy"] ?? "").slice(0, 60), "medium");
rec("headers", "X-Frame-Options DENY", h["x-frame-options"] === "DENY", h["x-frame-options"], "medium");
rec("headers", "nosniff", h["x-content-type-options"] === "nosniff", h["x-content-type-options"], "low");
rec("headers", "No x-powered-by banner", !h["x-powered-by"], h["x-powered-by"] ?? "absent", "low");
const page = await (await fetch(B + "/chat", { headers: { "User-Agent": UA, cookie: A.cookie } })).text();
const scripts = [...new Set([...page.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]))];
let bundle = "";
for (const s of scripts) bundle += await (await fetch(B + s)).text();
const secretHits = ["service_role", "SUPABASE_SERVICE_ROLE_KEY", "GROQ_API_KEY", "GEMINI_API_KEY", "ENCRYPTION_KEY", "ADMIN_DASHBOARD_TOKEN", "sb_secret_"]
  .filter((k) => bundle.includes(k));
const keyLike = (bundle.match(/gsk_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}/g) ?? []);
rec("bundle", `No server secrets in ${scripts.length} client JS files`, secretHits.length === 0 && keyLike.length === 0, `names=${secretHits.join(",") || "none"} keys=${keyLike.length}`, "critical");
const realService = env.SUPABASE_SERVICE_ROLE_KEY && bundle.includes(env.SUPABASE_SERVICE_ROLE_KEY.slice(-20));
rec("bundle", "Real service-role key absent from client JS", !realService, "", "critical");

// ---------------------------------------------------------------- cleanup (test data only)
await adminDb.from("documents").delete().eq("user_id", A.id);
await adminDb.from("projects").delete().eq("user_id", A.id);
await adminDb.from("conversations").delete().in("user_id", [A.id, Bg.id]);

fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
const fails = results.filter((x) => !x.pass && x.severity !== "info");
console.log(`${results.filter((x) => x.pass).length}/${results.length} passed`);
for (const f of fails) console.log(`FAIL [${f.severity}] ${f.area}: ${f.test} -- ${f.detail}`);
