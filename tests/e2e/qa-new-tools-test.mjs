// Requirements → Tests + Coverage, "Load from a document", and Bug Report from
// a screenshot (vision). Uses a real PNG with an error message drawn on it.
// Usage: node --import ./tests/e2e/xff.mjs tests/e2e/qa-new-tools-test.mjs <.env.local> <appUrl>
import fs from "fs";
import sharp from "sharp";
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

const REQS = `- Users can sign up with an email address and a password.
- The password must be 8-64 characters and contain at least one number.
- A verification email is sent right after sign-up; the link expires in 24 hours.
- After 5 failed log-in attempts the account is locked for 15 minutes.`;

const A = await guest();
const Bg = await guest();
try {
  let r = await post(A, "/api/qa/requirement-coverage", { input: REQS });
  let j = await r.json();
  const out = j.output;
  check("requirements are numbered by the server (R1–R4)", r.status === 200 && out?.requirements?.length === 4 && out.requirements[3].id === "R4", `${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  const covers = (out?.testCases ?? []).flatMap((tc) => tc.covers);
  check("every test case is traced to real requirement ids", covers.length > 0 && covers.every((c) => /^R[1-4]$/.test(c)), JSON.stringify(covers));
  check("all 4 requirements are covered", ["R1", "R2", "R3", "R4"].every((id) => covers.includes(id)), JSON.stringify(covers));

  r = await post(A, "/api/qa/requirement-coverage", { input: REQS, options: { onlyFor: "R3,R99", startAt: "20" } });
  j = await r.json();
  const gapCovers = (j.output?.testCases ?? []).flatMap((tc) => tc.covers);
  check("'tests for the gaps' only targets the asked requirement", r.status === 200 && gapCovers.length > 0 && gapCovers.every((c) => c === "R3"), JSON.stringify(gapCovers));
  check("no requirements → 400 (before using quota)", (await post(A, "/api/qa/requirement-coverage", { input: "hi" })).status === 400);

  const fd = new FormData();
  fd.append("file", new Blob([REQS], { type: "text/plain" }), "signup-prd.txt");
  const up = await (await fetch(`${B}/api/documents/upload`, { method: "POST", headers: A.H, body: fd })).json();
  const docId = up.documentId ?? up.document?.id;
  await post(A, "/api/documents/process", { documentId: docId });
  r = await fetch(`${B}/api/documents/${docId}/text`, { headers: A.H });
  j = await r.json();
  check("load requirements from my document", r.status === 200 && /locked for 15 minutes/.test(j.text ?? ""), `${r.status} ${JSON.stringify(j).slice(0, 120)}`);
  check("someone else's document text → 404", (await fetch(`${B}/api/documents/${docId}/text`, { headers: Bg.H })).status === 404);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="420"><rect width="100%" height="100%" fill="#ffffff"/>
    <text x="40" y="70" font-family="Arial" font-size="30" fill="#111">ShopKart — Checkout</text>
    <rect x="40" y="120" width="820" height="140" fill="#fde8e8" stroke="#e02424"/>
    <text x="70" y="180" font-family="Arial" font-size="34" fill="#c81e1e">Error 504: Payment gateway timeout</text>
    <text x="70" y="230" font-family="Arial" font-size="24" fill="#c81e1e">Order could not be created. Please try again.</text>
    <text x="40" y="330" font-family="Arial" font-size="22" fill="#555">Android · Chrome 129 · app v4.2.1</text></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
  r = await post(A, "/api/qa/bug-report", { input: "tapped Pay on checkout", image: dataUrl });
  j = await r.json();
  const text = JSON.stringify(j.output ?? j);
  check("bug report reads the error from the screenshot", r.status === 200 && /504/.test(text) && /timeout|time out|timed out/i.test(text), `${r.status} ${text.slice(0, 300)}`);
  check("screenshot only, no notes, still works", (await post(A, "/api/qa/bug-report", { input: "(no notes — see the screenshot)", image: dataUrl })).status === 200);
  const { data: hist } = await admin.from("qa_artifacts").select("input").eq("user_id", A.id).eq("type", "bug-report");
  check("history notes the screenshot but never stores it", (hist ?? []).length > 0 && hist.every((h) => h.input.includes("[screenshot attached]") && !h.input.includes("base64")), JSON.stringify(hist));
  const fake = `data:image/png;base64,${Buffer.from("this is not really a png file at all").toString("base64")}`;
  check("fake image bytes → 400", (await post(A, "/api/qa/bug-report", { input: "x", image: fake })).status === 400);
  check("JPEG label on PNG bytes → 400", (await post(A, "/api/qa/bug-report", { input: "x", image: dataUrl.replace("image/png", "image/jpeg") })).status === 400);
  check("screenshot on another tool → 400", (await post(A, "/api/qa/test-cases", { input: "login", image: dataUrl })).status === 400);
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
