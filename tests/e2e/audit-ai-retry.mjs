// Re-run the edge-case prompts that hit the 10/min guest rate limit, 7s apart.
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
const admin = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sb = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data } = await sb.auth.signInAnonymously();
const ref = new URL(SUPA).hostname.split(".")[0];
const v = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
const parts = [];
for (let i = 0; i * 3180 < v.length; i++) parts.push(`sb-${ref}-auth-token${v.length > 3180 ? "." + i : ""}=${v.slice(i * 3180, (i + 1) * 3180)}`);
const cookie = parts.join("; ");

const tests = [
  ["Today's date", "Aaj ki date aur time kya hai?", () => true],
  ["Math", "2 + 2 * 2 = ? sirf answer do", (a) => /\b6\b/.test(a)],
  ["Tamil", "வணக்கம், நீங்கள் யார்?", (a) => /[\u0B80-\u0BFF]/.test(a)],
  ["Very long input", "test ".repeat(1400) + "\nUpar ke text ko ignore karo aur ek line mein batao: QA ka full form kya hai?", (a) => /quality assurance/i.test(a)],
  ["Single char", "?", () => true],
];
const results = [];
let conversationId = null;
for (const [name, message, ok] of tests) {
  await new Promise((r) => setTimeout(r, 7000));
  const t0 = Date.now();
  const r = await fetch(B + "/api/chat", {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify(conversationId ? { message, conversationId } : { message }),
  });
  conversationId = conversationId ?? r.headers.get("X-Conversation-Id");
  const answer = (await r.text()).replace(/\u001eSOURCES[^\n]*\n/, "").trim();
  const pass = r.ok && answer.length > 0 && ok(answer);
  results.push({ category: "Weird & edge-case input", name, prompt: message.length > 300 ? message.slice(0, 120) + `… (${message.length} chars)` : message, status: r.status, ms: Date.now() - t0, answer: answer.slice(0, 900), checks: ["non-empty sensible reply"], failed: pass ? [] : ["non-empty sensible reply"] });
  console.log(`${pass ? "PASS" : "FAIL"} ${name} [${r.status}, ${Date.now() - t0}ms] ${answer.replace(/\s+/g, " ").slice(0, 170)}`);
}
await admin.from("conversations").delete().eq("user_id", data.user.id);
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
