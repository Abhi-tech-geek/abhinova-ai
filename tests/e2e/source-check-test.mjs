// Document answers: the 9-step trace comes back with real numbers, and
// "Check sources" tells supported statements from made-up ones.
// Usage: node --import ./tests/e2e/xff.mjs tests/e2e/source-check-test.mjs <.env.local> <appUrl>
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
const post = (g, path, json) => fetch(`${B}${path}`, { method: "POST", headers: { ...g.H, "Content-Type": "application/json" }, body: JSON.stringify(json) });

const A = await guest();
const Bg = await guest();
try {
  const fd = new FormData();
  fd.append("file", new Blob([
    "AbhiNova Test Handbook\n\nThe staging server restarts every Sunday at 2 AM IST.\nBugs marked P0 must be fixed within 24 hours.\nThe QA lead for the payments team is Meera.\n",
  ], { type: "text/plain" }), "handbook.txt");
  const up = await (await fetch(`${B}/api/documents/upload`, { method: "POST", headers: A.H, body: fd })).json();
  const docId = up.documentId ?? up.document?.id;
  await post(A, "/api/documents/process", { documentId: docId });

  const q = await (await post(A, "/api/documents/query", { question: "P0 bugs kitne time me fix karne hain aur QA lead kaun hai?", documentIds: [docId] })).json();
  const t = q.trace;
  check("answer comes with a trace", !!t && t.mode === "ask", JSON.stringify(q).slice(0, 200));
  check("trace: file name + passage count", t?.documents?.[0]?.fileName === "handbook.txt" && t.documents[0].chunks > 0, JSON.stringify(t?.documents));
  check("trace: passages used, similarity, context size, model, timings",
    t?.passagesUsed === q.sources.length && typeof t.topSimilarity === "number" && t.contextChars > 50 && !!t.embedModel && !!t.answerProvider && t.timingsMs.search >= 0 && t.timingsMs.answer > 0,
    JSON.stringify(t));

  const srcs = q.sources.map((s) => ({ tag: s.tag, id: s.id }));
  let r = await post(A, "/api/documents/verify", { answer: q.answer, sources: srcs });
  let v = await r.json();
  const realChecks = v.checks ?? [];
  check("real answer: statements checked", r.status === 200 && realChecks.length > 0, `${r.status} ${JSON.stringify(v).slice(0, 200)}`);
  check("real answer: mostly supported", realChecks.filter((c) => c.status === "supported").length >= Math.ceil(realChecks.length / 2), JSON.stringify(realChecks));

  const tricky = "P0 bugs must be fixed within 24 hours [S1]. P1 bugs must be fixed within one week [S1]. The company was founded in 1998 [S1]. Meera leads payments QA [S9].";
  r = await post(A, "/api/documents/verify", { answer: tricky, sources: [{ tag: "S1", id: srcs[0].id }] });
  v = await r.json();
  const st = (v.checks ?? []).map((c) => c.status);
  check("true statement → supported", st[0] === "supported", JSON.stringify(v.checks));
  check("wrong detail (P1, one week) → not supported", st[1] === "unsupported" || st[1] === "partial", JSON.stringify(v.checks?.[1]));
  check("made-up fact → unsupported", st[2] === "unsupported", JSON.stringify(v.checks?.[2]));
  check("cites a source that isn't there → missing", st[3] === "missing", JSON.stringify(v.checks?.[3]));

  r = await post(Bg, "/api/documents/verify", { answer: "P0 bugs must be fixed within 24 hours [S1].", sources: [{ tag: "S1", id: srcs[0].id }] });
  v = await r.json();
  check("someone else's passage can't be loaded (→ missing)", r.status === 200 && v.checks?.[0]?.status === "missing", JSON.stringify(v));
  check("no citations → nothing to check", (await (await post(A, "/api/documents/verify", { answer: "Hello there, nothing cited here.", sources: srcs })).json()).checks?.length === 0);
  check("bad request → 400", (await post(A, "/api/documents/verify", { answer: "x [S1]", sources: [{ tag: "S1", id: "nope" }] })).status === 400);
  check("signed out → 401", (await fetch(`${B}/api/documents/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status === 401);
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
