// With every AI provider failing (server started with bogus keys), each AI
// surface must answer "ai_busy" 503, chat must not leave stored messages or an
// empty conversation, and a wellness crisis message must still get helplines.
// Usage: node --import ./xff.mjs ai-busy-test.mjs <.env.local> <baseUrl>
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const B = process.argv[3];
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ref = new URL(SUPA).hostname.split(".")[0];
const sb = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data } = await sb.auth.signInAnonymously();
const uid = data.user.id;
const v = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
const parts = [];
for (let i = 0; i * 3180 < v.length; i++) parts.push(`sb-${ref}-auth-token${v.length > 3180 ? "." + i : ""}=${v.slice(i * 3180, (i + 1) * 3180)}`);
const cookie = parts.join("; ");
const post = (path, json) => fetch(B + path, { method: "POST", headers: { cookie, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 Chrome/130" }, body: JSON.stringify(json) });

let pass = 0, total = 0;
function check(name, ok, detail = "") { total++; if (ok) pass++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " -- " + detail}`); }
async function busy(name, path, json) {
  const t0 = Date.now();
  const r = await post(path, json);
  const body = await r.json().catch(() => ({}));
  check(`${name} → 503 ai_busy`, r.status === 503 && body.error === "ai_busy" && r.headers.get("retry-after") === "60", `${r.status} ${JSON.stringify(body)} (${Date.now() - t0}ms)`);
}

const first = await post("/api/chat", { message: "hello there" });
const firstBody = await first.json().catch(() => ({}));
const keptId = first.headers.get("x-conversation-id");
check("chat (new) → 503 ai_busy + kept chat id", first.status === 503 && firstBody.error === "ai_busy" && !!keptId, `${first.status} ${JSON.stringify(firstBody)} id=${keptId}`);
const { count: msgs } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("user_id", uid);
check("failed send left no stored message (no duplicate on resend)", msgs === 0, `messages=${msgs}`);
const usage1 = await (await fetch(B + "/api/beta/usage", { headers: { cookie } })).json();
await busy("resend into the kept chat", "/api/chat", { message: "hello there", conversationId: keptId });
const usage2 = await (await fetch(B + "/api/beta/usage", { headers: { cookie } })).json();
check("resend did not use another chat slot", usage2.usage?.chatsStarted === usage1.usage?.chatsStarted && usage1.usage?.chatsStarted === 1, `before=${usage1.usage?.chatsStarted} after=${usage2.usage?.chatsStarted}`);
const { count: convs } = await admin.from("conversations").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("mode", "workspace");
check("only the one kept chat exists", convs === 1, `conversations=${convs}`);
await busy("QA Studio", "/api/qa/test-cases", { input: "Login page with email and password" });
await busy("Code Studio chat", "/api/code/chat", { action: "explain", message: "explain", files: [{ path: "a.js", content: "let x = 1;" }] });
await busy("Code Studio docs", "/api/code/docs", { docType: "prd", description: "A todo app" });
const wr = await post("/api/wellness/chat", { message: "Aaj thoda thak gaya hoon", persona: "dost" });
const wb = await wr.json().catch(() => ({}));
check("Wellness talk → 503 ai_busy + kept session id", wr.status === 503 && wb.error === "ai_busy" && !!wr.headers.get("x-conversation-id"), `${wr.status} ${JSON.stringify(wb)}`);
const { count: wmsgs } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("conversation_id", wr.headers.get("x-conversation-id"));
check("wellness failure left no stored message", wmsgs === 0, `messages=${wmsgs}`);
await busy("Journal reflect", "/api/wellness/journal", { content: "I always mess things up." });

// Crisis text reused from the existing AI audit suite.
const crisis = fs.readFileSync(new URL("./audit-ai.mjs", import.meta.url), "utf8").match(/"Crisis statement", "([^"]+)"/)[1];
const cr = await post("/api/wellness/chat", { message: crisis, persona: "dost" });
const ctext = await cr.text();
check("crisis message still gets helplines while AI is down", cr.status === 200 && cr.headers.get("x-crisis") === "1" && /14416/.test(ctext) && /1800-599-0019/.test(ctext), `${cr.status} x-crisis=${cr.headers.get("x-crisis")}`);
check("crisis fallback returns the session id", !!cr.headers.get("x-conversation-id"), "no X-Conversation-Id");

await admin.from("conversations").delete().eq("user_id", uid);
await admin.auth.admin.deleteUser(uid);
console.log(`\n${pass}/${total} passed (test guest deleted)`);
