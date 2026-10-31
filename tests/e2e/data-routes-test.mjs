// Server routes that replaced direct browser→Supabase writes (desktop prep):
// owner-only rename/delete, document delete + library list, profile rules for
// guests, journal save, history deletes, input validation, 401 when signed out.
// Usage: node --import ./tests/e2e/xff.mjs tests/e2e/data-routes-test.mjs <.env.local> <appUrl>
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const B = process.argv[3];
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(SUPA).hostname.split(".")[0];
const admin = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0, total = 0;
const check = (n, ok, d = "") => { total++; if (ok) pass++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${ok ? "" : " -- " + d}`); };

async function guest() {
  const { data, error } = await createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).auth.signInAnonymously();
  if (error) throw error;
  const v = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const parts = [];
  for (let i = 0; i * 3180 < v.length; i++) parts.push(`sb-${ref}-auth-token${v.length > 3180 ? "." + i : ""}=${v.slice(i * 3180, (i + 1) * 3180)}`);
  return { id: data.user.id, H: { cookie: parts.join("; "), "User-Agent": "Mozilla/5.0 Chrome/130" } };
}
const req = (g, method, path, json) =>
  fetch(`${B}${path}`, {
    method,
    headers: { ...(g?.H ?? { "User-Agent": "Mozilla/5.0 Chrome/130" }), ...(json ? { "Content-Type": "application/json" } : {}) },
    ...(json ? { body: JSON.stringify(json) } : {}),
  });

const A = await guest();
const Bg = await guest();
try {
  const { data: conv } = await admin.from("conversations").insert({ user_id: A.id, title: "Old title", mode: "workspace" }).select("id").single();

  check("signed out → 401", (await req(null, "DELETE", `/api/conversations/${conv.id}`)).status === 401);
  check("bad id → 400", (await req(A, "DELETE", "/api/conversations/not-a-uuid")).status === 400);
  check("empty title → 400", (await req(A, "PATCH", `/api/conversations/${conv.id}`, { title: "   " })).status === 400);
  check("other user can't rename (404)", (await req(Bg, "PATCH", `/api/conversations/${conv.id}`, { title: "hacked" })).status === 404);
  check("other user can't delete (404)", (await req(Bg, "DELETE", `/api/conversations/${conv.id}`)).status === 404);
  let r = await req(A, "PATCH", `/api/conversations/${conv.id}`, { title: "New title" });
  const { data: renamed } = await admin.from("conversations").select("title").eq("id", conv.id).single();
  check("owner renames", r.status === 200 && renamed.title === "New title", `${r.status} ${renamed?.title}`);
  r = await req(A, "DELETE", `/api/conversations/${conv.id}`);
  const { data: gone } = await admin.from("conversations").select("id").eq("id", conv.id);
  check("owner deletes", r.status === 200 && gone.length === 0, r.status);

  const fd = new FormData();
  fd.append("file", new Blob(["Library file\n\nA note for the library list test.\n"], { type: "text/plain" }), "library.txt");
  const up = await (await fetch(`${B}/api/documents/upload`, { method: "POST", headers: A.H, body: fd })).json();
  const docId = up.documentId ?? up.document?.id;
  await req(A, "POST", "/api/documents/process", { documentId: docId });
  const lib = await (await req(A, "GET", "/api/documents")).json();
  check("library list shows my ready file", (lib.documents ?? []).some((d) => d.id === docId), JSON.stringify(lib).slice(0, 160));
  const libB = await (await req(Bg, "GET", "/api/documents")).json();
  check("library list never shows someone else's file", !(libB.documents ?? []).some((d) => d.id === docId));
  check("other user can't delete my document (404)", (await req(Bg, "DELETE", `/api/documents/${docId}`)).status === 404);
  const { data: docRow } = await admin.from("documents").select("storage_path").eq("id", docId).single();
  r = await req(A, "DELETE", `/api/documents/${docId}`);
  const { data: docGone } = await admin.from("documents").select("id").eq("id", docId);
  const folder = docRow.storage_path.split("/").slice(0, -1).join("/");
  const { data: files } = await admin.storage.from("documents").list(folder);
  check("owner deletes document + stored file", r.status === 200 && docGone.length === 0 && !(files ?? []).some((f) => docRow.storage_path.endsWith(f.name)), r.status);

  r = await req(A, "PATCH", "/api/profile", { wellnessEnabled: true });
  const { data: prof } = await admin.from("profiles").select("wellness_enabled").eq("id", A.id).single();
  check("guest can switch Wellness Mode", r.status === 200 && prof.wellness_enabled === true, r.status);
  check("guest can't change Settings fields (403)", (await req(A, "PATCH", "/api/profile", { displayName: "x" })).status === 403);
  check("bad profile value → 400", (await req(A, "PATCH", "/api/profile", { themePref: "neon" })).status === 400);
  check("empty profile update → 400", (await req(A, "PATCH", "/api/profile", {})).status === 400);

  r = await req(A, "POST", "/api/wellness/journal/entries", { content: "Aaj ka din theek tha.", distortions: null, reframe: null });
  const { data: entries } = await admin.from("journal_entries").select("content").eq("user_id", A.id);
  check("journal entry saved", r.status === 201 && entries.length === 1, `${r.status} ${entries?.length}`);
  check("empty journal entry → 400", (await req(A, "POST", "/api/wellness/journal/entries", { content: " " })).status === 400);

  const { data: art } = await admin.from("qa_artifacts").insert({ user_id: A.id, type: "test-cases", input: "x", output: "{}" }).select("id").single();
  if (art) {
    check("other user can't delete my QA run (404)", (await req(Bg, "DELETE", `/api/qa/artifacts/${art.id}`)).status === 404);
    check("owner deletes QA run", (await req(A, "DELETE", `/api/qa/artifacts/${art.id}`)).status === 200);
  } else check("seed QA run", false, "insert failed");
  const { data: cdoc } = await admin.from("code_docs").insert({ user_id: A.id, doc_type: "prd", title: "PRD", content: "x" }).select("id").single();
  if (cdoc) {
    check("other user can't delete my code doc (404)", (await req(Bg, "DELETE", `/api/code/docs/${cdoc.id}`)).status === 404);
    check("owner deletes code doc", (await req(A, "DELETE", `/api/code/docs/${cdoc.id}`)).status === 200);
  } else check("seed code doc", false, "insert failed");
} finally {
  for (const g of [A, Bg]) {
    const { data: docs } = await admin.from("documents").select("storage_path").eq("user_id", g.id);
    const paths = (docs ?? []).map((d) => d.storage_path).filter(Boolean);
    if (paths.length) await admin.storage.from("documents").remove(paths);
    await admin.auth.admin.deleteUser(g.id);
  }
}
console.log(`\n${pass}/${total} passed`);
process.exit(pass === total ? 0 : 1);
