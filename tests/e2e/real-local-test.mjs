// Every feature against the REAL local Ollama (Local Mode dev server).
// Prints timings and the start of each answer so quality can be judged.
// Usage: node --import ./xff.mjs real-local-test.mjs <.env.local> <appUrl>
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const B = process.argv[3];
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(SUPA).hostname.split(".")[0];
const admin = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sb = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data } = await sb.auth.signInAnonymously();
const uid = data.user.id;
const v = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
const parts = [];
for (let i = 0; i * 3180 < v.length; i++) parts.push(`sb-${ref}-auth-token${v.length > 3180 ? "." + i : ""}=${v.slice(i * 3180, (i + 1) * 3180)}`);
const H = { cookie: parts.join("; "), "User-Agent": "Mozilla/5.0 Chrome/130" };
const post = (p, json) => fetch(B + p, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(json) });

let pass = 0, total = 0;
const check = (n, ok, d = "") => { total++; if (ok) pass++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${d ? "\n     " + d : ""}`); };
async function stream(path, json) {
  const t0 = Date.now();
  const r = await post(path, json);
  if (!r.ok) return { r, text: await r.text(), first: 0, ms: Date.now() - t0 };
  const reader = r.body.getReader(); const dec = new TextDecoder();
  let text = "", first = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; if (!first) first = Date.now() - t0; text += dec.decode(value, { stream: true }); }
  return { r, text: text.replace(/\u001eSOURCES[^\n]*\n/, "").trim(), first, ms: Date.now() - t0 };
}
const s = (ms) => (ms / 1000).toFixed(1) + "s";

const models = (await (await fetch(B + "/api/models/list", { headers: H })).json()).models ?? [];
check("model picker shows the local model first", models[0]?.id === "ollama/llama3.2", models[0]?.label);

let x = await stream("/api/chat", { message: "Explain in 2 short lines what regression testing is." });
check("chat (English)", x.r.status === 200 && x.r.headers.get("x-ai-provider") === "ollama" && x.text.length > 20, `${x.r.headers.get("x-ai-provider")} · first word ${s(x.first)} · full ${s(x.ms)} · "${x.text.replace(/\s+/g, " ").slice(0, 150)}"`);
const conv = x.r.headers.get("x-conversation-id");
x = await stream("/api/chat", { message: "Ab yahi Hinglish me batao", conversationId: conv });
check("chat follow-up (Hinglish, uses history)", x.r.status === 200 && x.text.length > 20, `first word ${s(x.first)} · full ${s(x.ms)} · "${x.text.replace(/\s+/g, " ").slice(0, 150)}"`);

const fd = new FormData();
fd.append("file", new Blob(["Login spec v2. Users sign in with email and OTP. The OTP expires after 7 minutes. Three wrong OTPs lock the account for 30 minutes."], { type: "text/plain" }), "login-spec.txt");
const up = await (await fetch(B + "/api/documents/upload", { method: "POST", headers: H, body: fd })).json();
let t0 = Date.now();
const pr = await (await post("/api/documents/process", { documentId: up.documentId })).json();
check("document processed with local embeddings", pr.status === "ready", `${JSON.stringify(pr)} · ${s(Date.now() - t0)}`);
t0 = Date.now();
const q = await (await post("/api/documents/query", { question: "How long until the OTP expires, and what happens after three wrong OTPs?", documentIds: [up.documentId] })).json();
check("document Q&A (RAG) answers from the file", /7/.test(q.answer ?? "") && /30/.test(q.answer ?? ""), `${s(Date.now() - t0)} · "${(q.answer ?? JSON.stringify(q)).replace(/\s+/g, " ").slice(0, 200)}"`);

t0 = Date.now();
let r = await post("/api/qa/test-cases", { input: "Login with email + OTP. OTP expires after 7 minutes. 3 wrong OTPs lock the account." });
let j = await r.json().catch(() => ({}));
check("QA Studio test cases (strict JSON)", r.status === 200 && (j.output?.testCases?.length ?? 0) >= 3, `${r.status} · ${s(Date.now() - t0)} · ${r.ok ? (j.output.testCases.length + " cases, first: " + j.output.testCases[0]?.title) : JSON.stringify(j)}`);

x = await stream("/api/code/chat", { action: "fix", message: "Is code me bug kya hai?", files: [{ path: "cart.js", content: "function total(items){ let t=0; for(let i=0;i<=items.length;i++){ t+=items[i].price } return t }" }] });
check("Code Studio finds the off-by-one bug", x.r.status === 200 && /<=|length|undefined|off.by.one/i.test(x.text), `first word ${s(x.first)} · full ${s(x.ms)} · "${x.text.replace(/\s+/g, " ").slice(0, 160)}"`);

x = await stream("/api/wellness/chat", { message: "Aaj kaam ka pressure bahut tha", persona: "dost" });
check("Wellness talk (disclaimer present)", x.r.status === 200 && /(therapist ka replacement nahi|not a replacement for a professional therapist)/i.test(x.text), `first word ${s(x.first)} · full ${s(x.ms)} · "${x.text.replace(/\s+/g, " ").slice(0, 160)}"`);

const usage = (await (await fetch(B + "/api/beta/usage", { headers: H })).json()).usage;
check("no beta AI quota used", usage?.aiUsedToday === 0, JSON.stringify(usage));

const { data: files } = await admin.storage.from("documents").list(uid);
if (files?.length) await admin.storage.from("documents").remove(files.map((f) => `${uid}/${f.name}`));
await admin.from("conversations").delete().eq("user_id", uid);
await admin.auth.admin.deleteUser(uid);
console.log(`\n${pass}/${total} passed (test guest deleted)`);
