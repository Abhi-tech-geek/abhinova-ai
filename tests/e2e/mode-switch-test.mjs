// Online ↔ Local Mode safety:
//   phase "local": run against a Local Mode server. Checks it only answers on
//     localhost (Host check), uploads + indexes a file locally, saves state.
//   phase "cloud": run against a cloud server with the same database. The local
//     file is flagged "other mode", skipped by search, then re-indexed. Cleans up.
// Usage: node --import ./tests/e2e/xff.mjs tests/e2e/mode-switch-test.mjs <.env.local> <appUrl> <local|cloud> <stateFile>
import fs from "fs";
import http from "http";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const [B, phase, stateFile] = process.argv.slice(3);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(SUPA).hostname.split(".")[0];
const admin = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0, total = 0;
const check = (n, ok, d = "") => { total++; if (ok) pass++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${ok ? "" : " -- " + d}`); };
const UA = "Mozilla/5.0 Chrome/130";

function headersFor(session) {
  const v = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const parts = [];
  for (let i = 0; i * 3180 < v.length; i++) parts.push(`sb-${ref}-auth-token${v.length > 3180 ? "." + i : ""}=${v.slice(i * 3180, (i + 1) * 3180)}`);
  return { cookie: parts.join("; "), "User-Agent": UA };
}
const post = (H, path, json) => fetch(`${B}${path}`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(json) });
const ask = async (H, docId) => (await post(H, "/api/documents/query", { question: "Which day does the staging server restart?", documentIds: [docId] })).json();
const docsPage = async (H) => (await fetch(`${B}/documents`, { headers: H })).text();

// fetch() drops a custom Host header, so this one uses node:http.
const statusWithHost = (host) =>
  new Promise((resolve, reject) => {
    const u = new URL(B);
    http.get({ host: u.hostname, port: u.port, path: "/privacy", headers: { Host: host, "User-Agent": UA } }, (r) => {
      r.resume();
      resolve(r.statusCode);
    }).on("error", reject);
  });

if (phase === "local") {
  const evil = await statusWithHost("evil.example");
  check("Local Mode refuses a foreign Host (DNS rebinding)", evil === 403, evil);
  const ok = await fetch(`${B}/privacy`, { headers: { "User-Agent": UA }, redirect: "manual" });
  check("Local Mode still answers on localhost", ok.status === 200 || ok.status === 307, ok.status);

  const { data, error } = await createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).auth.signInAnonymously();
  if (error) throw error;
  const H = headersFor(data.session);
  const fd = new FormData();
  fd.append("file", new Blob(["Ops notes\n\nThe staging server restarts every Sunday at 2 AM IST.\n"], { type: "text/plain" }), "ops-notes.txt");
  const up = await (await fetch(`${B}/api/documents/upload`, { method: "POST", headers: H, body: fd })).json();
  const docId = up.documentId ?? up.document?.id;
  const pr = await (await post(H, "/api/documents/process", { documentId: docId })).json();
  check("file indexed in Local Mode", pr.status === "ready", JSON.stringify(pr));
  const { data: chunk } = await admin.from("document_chunks").select("metadata").eq("document_id", docId).eq("chunk_index", 0).single();
  check("chunks are tagged with the local model", /^ollama\//.test(chunk?.metadata?.embedModel ?? ""), JSON.stringify(chunk?.metadata));
  const q = await ask(H, docId);
  check("search finds it in Local Mode", (q.sources ?? []).length > 0, JSON.stringify(q).slice(0, 200));
  check("no other-mode warning in Local Mode", !(await docsPage(H)).includes("documents-list-other-mode"));
  fs.writeFileSync(stateFile, JSON.stringify({ session: data.session, userId: data.user.id, docId }));
} else {
  const { session, userId, docId } = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const H = headersFor(session);
  try {
    let html = await docsPage(H);
    check("Online Mode flags the locally indexed file", html.includes("documents-list-other-mode") && /Indexed in (<!-- -->)?Local/.test(html), html.length);
    check("Online Mode answers any Host (it's a public site)", (await statusWithHost("abhinova.example")) !== 403);
    let q = await ask(H, docId);
    check("search skips the other-mode file (no nonsense matches)", (q.sources ?? []).length === 0, JSON.stringify(q.sources ?? q).slice(0, 200));
    const pr = await (await post(H, "/api/documents/process", { documentId: docId })).json();
    check("Re-index works", pr.status === "ready", JSON.stringify(pr));
    html = await docsPage(H);
    check("warning gone after re-index", !html.includes("documents-list-other-mode"));
    q = await ask(H, docId);
    check("search finds it after re-index", (q.sources ?? []).length > 0 && /Sunday/i.test(q.answer ?? ""), (q.answer ?? JSON.stringify(q)).slice(0, 200));
  } finally {
    const { data: docs } = await admin.from("documents").select("storage_path").eq("user_id", userId);
    const paths = (docs ?? []).map((d) => d.storage_path).filter(Boolean);
    if (paths.length) await admin.storage.from("documents").remove(paths);
    await admin.from("documents").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
    fs.rmSync(stateFile, { force: true });
  }
}
console.log(`\n${pass}/${total} passed`);
process.exit(pass === total ? 0 : 1);
