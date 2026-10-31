// Local Mode integration test against a dev server started with OLLAMA_URL
// pointing at mock-ollama.mjs and BOGUS cloud keys (so any cloud call would fail).
// Usage: node --import ./xff.mjs local-mode-test.mjs <.env.local> <appUrl> <mockUrl>
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const B = process.argv[3];
const MOCK = process.argv[4];
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(SUPA).hostname.split(".")[0];
const admin = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sb = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data } = await sb.auth.signInAnonymously();
const uid = data.user.id;
const v = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
const parts = [];
for (let i = 0; i * 3180 < v.length; i++) parts.push(`sb-${ref}-auth-token${v.length > 3180 ? "." + i : ""}=${v.slice(i * 3180, (i + 1) * 3180)}`);
const cookie = parts.join("; ");
const H = { cookie, "User-Agent": "Mozilla/5.0 Chrome/130" };
const post = (p, json) => fetch(B + p, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(json) });

let pass = 0, total = 0;
const check = (n, ok, d = "") => { total++; if (ok) pass++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${ok ? "" : " -- " + d}`); };

const models = (await (await fetch(B + "/api/models/list", { headers: H })).json()).models ?? [];
check("model list shows the local model first", models[0]?.id === "ollama/llama3.2" && /Local/.test(models[0]?.label), JSON.stringify(models[0]));

let r = await post("/api/chat", { message: "Namaste local llama" });
let t = await r.text();
const conv = r.headers.get("x-conversation-id");
check("chat (Auto) is answered by the local model", r.status === 200 && r.headers.get("x-ai-provider") === "ollama" && /Local Llama says/.test(t), `${r.status} ${r.headers.get("x-ai-provider")} ${t.slice(0, 80)}`);

r = await post("/api/chat", { message: "second message", conversationId: conv, modelId: "ollama/llama3.2" });
t = await r.text();
check("explicitly picked local model works", r.status === 200 && /Local Llama says/.test(t), `${r.status} ${t.slice(0, 80)}`);

r = await post("/api/chat", { message: "hello", conversationId: conv, modelId: "ollama/not-pulled-model" });
const off = await r.json().catch(() => ({}));
check("model not available → 503 local_ai_offline", r.status === 503 && off.error === "local_ai_offline", `${r.status} ${JSON.stringify(off)}`);

// Documents: local embeddings (768-d) end to end.
const fd = new FormData();
fd.append("file", new Blob(["Login spec. OTP expires after 7 minutes. Three wrong OTPs lock the account."], { type: "text/plain" }), "otp.txt");
const up = await (await fetch(B + "/api/documents/upload", { method: "POST", headers: H, body: fd })).json();
const pr = await (await post("/api/documents/process", { documentId: up.documentId })).json();
check("document processed with local embeddings", pr.status === "ready" && pr.chunkCount > 0, JSON.stringify(pr));
const q = await (await post("/api/documents/query", { question: "When does the OTP expire?", documentIds: [up.documentId] })).json();
check("document Q&A answers from the file via the local model", /7 minutes/.test(q.answer ?? "") && (q.sources?.length ?? 0) > 0, JSON.stringify(q).slice(0, 160));

const usage = (await (await fetch(B + "/api/beta/usage", { headers: H })).json()).usage;
check("no daily beta AI quota used in Local Mode", usage?.aiUsedToday === 0, JSON.stringify(usage));

const hits = await (await fetch(MOCK + "/__hits")).json();
check("chat + embeddings all hit the local Ollama", hits.some((h) => h.startsWith("POST /v1/chat/completions")) && hits.some((h) => h.startsWith("POST /api/embed")), JSON.stringify(hits));
console.log("   ollama calls:", hits.filter((h) => !h.includes("__hits")).length);

const { data: files } = await admin.storage.from("documents").list(uid);
if (files?.length) await admin.storage.from("documents").remove(files.map((f) => `${uid}/${f.name}`));
await admin.from("conversations").delete().eq("user_id", uid);
await admin.auth.admin.deleteUser(uid);
console.log(`\n${pass}/${total} passed (test guest deleted)`);
