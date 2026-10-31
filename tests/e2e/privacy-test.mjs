// Privacy features: /privacy page, sidebar link, mode banner, and
// "Delete my data" (wipes only the caller's data, needs confirmation).
// Usage: node --import ./xff.mjs privacy-test.mjs <.env.local> <appUrl> <local|cloud>
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const B = process.argv[3];
const MODE = process.argv[4];
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(SUPA).hostname.split(".")[0];
const admin = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0, total = 0;
const check = (n, ok, d = "") => { total++; if (ok) pass++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${ok ? "" : " -- " + d}`); };

async function guest() {
  const sb = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  const v = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const parts = [];
  for (let i = 0; i * 3180 < v.length; i++) parts.push(`sb-${ref}-auth-token${v.length > 3180 ? "." + i : ""}=${v.slice(i * 3180, (i + 1) * 3180)}`);
  const db = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${data.session.access_token}` } } });
  return { id: data.user.id, H: { cookie: parts.join("; "), "User-Agent": "Mozilla/5.0 Chrome/130" }, db };
}
const call = (g, p, { method = "GET", json, form } = {}) =>
  fetch(B + p, { method, headers: { ...g.H, ...(json ? { "Content-Type": "application/json" } : {}) }, body: json ? JSON.stringify(json) : form, redirect: "manual" });

// Seed a guest with one of everything (no AI calls needed).
async function seed(g, tag) {
  const { data: conv } = await g.db.from("conversations").insert({ user_id: g.id, title: `${tag} chat`, mode: "workspace" }).select("id").single();
  await g.db.from("messages").insert({ conversation_id: conv.id, user_id: g.id, role: "user", content: `${tag} hello` });
  const fd = new FormData();
  fd.append("file", new Blob([`${tag} private notes`], { type: "text/plain" }), `${tag}.txt`);
  await (await call(g, "/api/documents/upload", { method: "POST", form: fd })).json();
  const pj = await (await call(g, "/api/projects", { method: "POST", json: { name: `${tag} project` } })).json();
  await call(g, `/api/projects/${pj.project?.id}/notes`, { method: "POST", json: { content: `${tag} note` } });
  await g.db.from("qa_artifacts").insert({ user_id: g.id, type: "test-cases", input: `${tag} req`, output: "{}" });
  await call(g, "/api/wellness/mood", { method: "POST", json: { mood: 3 } });
  await call(g, "/api/feedback", { method: "POST", json: { category: "other", message: `[automated test] ${tag} privacy test` } });
}
const TABLES = ["conversations", "messages", "documents", "projects", "project_notes", "qa_artifacts", "mood_logs", "feedback"];
async function counts(uid) {
  const out = {};
  for (const t of TABLES) out[t] = (await admin.from(t).select("*", { count: "exact", head: true }).eq("user_id", uid)).count;
  out.files = ((await admin.storage.from("documents").list(uid)).data ?? []).length;
  return out;
}

const A = await guest();
const Bg = await guest();

// Pages (server-rendered HTML; no hydration needed).
const page = await call(A, "/privacy");
const html = await page.text();
check("/privacy renders for a guest", page.status === 200 && html.includes('data-testid="privacy-page"'), page.status);
check(`/privacy shows the ${MODE} mode`, MODE === "local" ? html.includes("Local Mode is on") : html.includes("using the hosted version"), "mode text missing");
check("/privacy has local-run steps + delete section", html.includes("ollama pull llama3.2") && html.includes('id="delete"') && html.includes("Delete my data"));
const chatHtml = await (await call(A, "/chat")).text();
check("sidebar has the Privacy link", chatHtml.includes('data-testid="sidebar-privacy-link"'));
check(`top banner is ${MODE === "local" ? "Local Mode" : "the beta"} banner`, MODE === "local" ? chatHtml.includes('data-testid="workspace-local-mode-banner"') : !chatHtml.includes("workspace-local-mode-banner"));
const fresh = await fetch(B + "/privacy", { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 Chrome/130" } });
check("signed-out /privacy link opens in one hop (guest minted)", fresh.status === 200 && (fresh.headers.get("set-cookie") ?? "").includes("sb-"), `${fresh.status} ${fresh.headers.get("location")}`);

await seed(A, "alpha");
await seed(Bg, "beta");
const before = await counts(A.id);
check("guest A has data in every place", Object.values(before).every((n) => n > 0), JSON.stringify(before));

let r = await call(A, "/api/account/data", { method: "DELETE", json: {} });
check("delete without typed confirmation → 400", r.status === 400, r.status);
r = await call(A, "/api/account/data", { method: "DELETE", json: { confirm: "delete" } });
check("wrong confirmation word → 400", r.status === 400, r.status);
r = await fetch(B + "/api/account/data", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) });
check("no session → 401", r.status === 401, r.status);
r = await call(A, "/api/account/data", { method: "DELETE", json: { confirm: "DELETE" } });
check("confirmed delete → 200", r.status === 200, `${r.status} ${await r.text()}`);

const after = await counts(A.id);
check("all of A's data and files are gone", Object.values(after).every((n) => n === 0), JSON.stringify(after));
const other = await counts(Bg.id);
check("guest B's data is untouched", Object.values(other).every((n) => n > 0), JSON.stringify(other));
const still = await call(A, "/chat");
check("A's session still works after deleting data", still.status === 200, still.status);

for (const g of [A, Bg]) {
  const { data: files } = await admin.storage.from("documents").list(g.id);
  if (files?.length) await admin.storage.from("documents").remove(files.map((f) => `${g.id}/${f.name}`));
  await admin.from("feedback").delete().eq("user_id", g.id);
  await admin.auth.admin.deleteUser(g.id);
}
console.log(`\n${pass}/${total} passed (test guests deleted)`);
