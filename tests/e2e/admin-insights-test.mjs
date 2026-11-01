// Owner dashboard: event counters go up for regenerate / chat search / source
// check, ratings show, and the new section renders — counts only, no content.
// Run against a server started with TRACK_EVENTS=1. The test takes its own
// increments back out of the live counters afterwards.
// Usage: node --import ./tests/e2e/xff.mjs tests/e2e/admin-insights-test.mjs <.env.local> <appUrl>
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const B = process.argv[3];
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(SUPA).hostname.split(".")[0];
const admin = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const UA = "Mozilla/5.0 Chrome/130";

let pass = 0, total = 0;
const check = (n, ok, d = "") => { total++; if (ok) pass++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${ok ? "" : " -- " + d}`); };

const day = new Date().toISOString().slice(0, 10);
const EVENTS = ["regenerate", "chat_search", "source_check"];
const bucket = (e) => `event:${e}:${day}`;
async function counters() {
  const { data } = await admin.from("beta_usage").select("bucket, used").eq("subject", "site").in("bucket", EVENTS.map(bucket));
  return Object.fromEntries(EVENTS.map((e) => [e, data?.find((r) => r.bucket === bucket(e))?.used ?? 0]));
}

const { data: s, error } = await createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).auth.signInAnonymously();
if (error) throw error;
const v = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
const parts = [];
for (let i = 0; i * 3180 < v.length; i++) parts.push(`sb-${ref}-auth-token${v.length > 3180 ? "." + i : ""}=${v.slice(i * 3180, (i + 1) * 3180)}`);
const H = { cookie: parts.join("; "), "User-Agent": UA };
const post = (path, json) => fetch(`${B}${path}`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(json) });

const before = await counters();
let after = before;
try {
  let r = await post("/api/chat", { message: "Say hello in two words" });
  await r.text();
  const conv = r.headers.get("X-Conversation-Id");
  r = await post("/api/chat", { message: "x", conversationId: conv, regenerate: true });
  await r.text();
  const replyId = r.headers.get("X-Assistant-Message-Id");
  await post(`/api/messages/${replyId}/feedback`, { rating: 1 });
  await fetch(`${B}/api/conversations/search?q=hello`, { headers: H }).then((x) => x.text());

  const fd = new FormData();
  fd.append("file", new Blob(["Handbook\n\nP0 bugs must be fixed within 24 hours.\n"], { type: "text/plain" }), "h.txt");
  const up = await (await fetch(`${B}/api/documents/upload`, { method: "POST", headers: H, body: fd })).json();
  const docId = up.documentId ?? up.document?.id;
  await post("/api/documents/process", { documentId: docId });
  const q = await (await post("/api/documents/query", { question: "P0 fix time?", documentIds: [docId] })).json();
  await post("/api/documents/verify", { answer: "P0 bugs must be fixed within 24 hours [S1].", sources: q.sources.map((x) => ({ tag: x.tag, id: x.id })) }).then((x) => x.text());

  await new Promise((res) => setTimeout(res, 2500)); // counters are written after the response
  after = await counters();
  for (const e of EVENTS) check(`${e} counted`, after[e] === before[e] + 1, `${before[e]} → ${after[e]}`);

  const login = await fetch(`${B}/admin/login`, { method: "POST", body: new URLSearchParams({ key: env.ADMIN_DASHBOARD_TOKEN }), redirect: "manual", headers: { "User-Agent": UA } });
  const ck = (login.headers.get("set-cookie") ?? "").match(/anv_admin=[^;]+/)?.[0];
  const html = await (await fetch(`${B}/admin?days=7`, { headers: { cookie: ck ?? "", "User-Agent": UA } })).text();
  check("dashboard shows the ratings tiles", html.includes('data-testid="admin-tile-thumbs-up"') && html.includes("Happy with replies"));
  check("dashboard shows new-feature usage + AI busy + personalisation", ["admin-card-new-features", "admin-card-ai-busy", "admin-card-personalisation"].every((t) => html.includes(t)));
  check("dashboard never shows chat or document text", !html.includes("Say hello in two words") && !html.includes("P0 bugs must be fixed"));
  const noCookie = await (await fetch(`${B}/admin?days=7`, { headers: { "User-Agent": UA } })).text();
  check("without the admin cookie: no stats", !noCookie.includes("admin-card-new-features"));
} finally {
  // Take this test's increments back out of the live counters.
  const now = await counters();
  for (const e of EVENTS) {
    const ours = Math.max(0, Math.min(now[e] - before[e], 1));
    if (ours > 0) await admin.from("beta_usage").update({ used: now[e] - ours }).eq("subject", "site").eq("bucket", bucket(e));
  }
  const { data: docs } = await admin.from("documents").select("storage_path").eq("user_id", s.user.id);
  const paths = (docs ?? []).map((d) => d.storage_path).filter(Boolean);
  if (paths.length) await admin.storage.from("documents").remove(paths);
  await admin.auth.admin.deleteUser(s.user.id);
}
console.log(`\n${pass}/${total} passed`);
process.exit(pass === total ? 0 : 1);
