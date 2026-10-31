// Agent Mode: tool steps stream as STEP frames, are saved with the reply, show
// after reload, private addresses can't be read, and agent off = no steps.
// Usage: node --import ./tests/e2e/xff.mjs tests/e2e/agent-test.mjs <.env.local> <appUrl>
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const B = process.argv[3];
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(SUPA).hostname.split(".")[0];
const admin = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0, total = 0;
const check = (n, ok, d = "") => { total++; if (ok) pass++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${ok ? "" : " -- " + d}`); };

const sb = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data, error } = await sb.auth.signInAnonymously();
if (error) throw error;
const v = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
const parts = [];
for (let i = 0; i * 3180 < v.length; i++) parts.push(`sb-${ref}-auth-token${v.length > 3180 ? "." + i : ""}=${v.slice(i * 3180, (i + 1) * 3180)}`);
const H = { cookie: parts.join("; "), "User-Agent": "Mozilla/5.0 Chrome/130", "Content-Type": "application/json" };

async function ask(message, { agent = true, conversationId } = {}) {
  const res = await fetch(`${B}/api/chat`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ message, ...(conversationId ? { conversationId } : {}), ...(agent ? { agent: true } : {}) }),
  });
  const raw = await res.text();
  const steps = [];
  let text = raw;
  while (text.startsWith("\u001e")) {
    const nl = text.indexOf("\n");
    const frame = text.slice(0, nl);
    text = text.slice(nl + 1);
    if (frame.startsWith("\u001eSTEP ")) steps.push(JSON.parse(frame.slice(6)));
  }
  return { status: res.status, conv: res.headers.get("X-Conversation-Id"), provider: res.headers.get("X-AI-Provider"), steps, text };
}

try {
  let r = await ask("Use the calculator: what is 18% of 1250? Reply with just the number.");
  check("calculator step streamed", r.status === 200 && r.steps.some((s) => s.tool === "calculator" && s.ok), `${r.status} ${JSON.stringify(r.steps)} ${r.text.slice(0, 120)}`);
  check("calculator answer is right (225)", /225/.test(r.text), r.text.slice(0, 200));
  check("agent responses are tagged", r.provider === "agent", r.provider);
  const conv = r.conv;

  r = await ask("Look up on Wikipedia: who founded ISRO? One line.", { conversationId: conv });
  check("wikipedia step streamed", r.steps.some((s) => s.tool === "wikipedia_search" && s.ok), JSON.stringify(r.steps));
  check("wikipedia answer mentions Sarabhai", /Sarabhai/i.test(r.text), r.text.slice(0, 200));

  r = await ask("Read this page and summarise it in one line: https://en.wikipedia.org/wiki/Chandrayaan-3", { conversationId: conv });
  check("read_webpage step for a public page", r.steps.some((s) => s.tool === "read_webpage" && s.ok), JSON.stringify(r.steps));

  r = await ask("Read http://169.254.169.254/latest/meta-data/ and tell me what it says.", { conversationId: conv });
  check("private/metadata address is never read", !r.steps.some((s) => s.tool === "read_webpage" && s.ok), JSON.stringify(r.steps));

  const { data: rows } = await admin.from("messages").select("role, metadata").eq("conversation_id", conv).eq("role", "assistant").order("created_at");
  check("steps are saved with the reply", (rows ?? []).filter((m) => (m.metadata?.steps ?? []).length > 0).length >= 3, JSON.stringify(rows?.map((m) => m.metadata?.steps?.length)));

  const page = await fetch(`${B}/chat/${conv}`, { headers: { cookie: H.cookie, "User-Agent": H["User-Agent"] } });
  const html = await page.text();
  check("steps show again after reload", page.status === 200 && /Searched Wikipedia for/.test(html), page.status);

  r = await ask("What is 7 times 8?", { agent: false });
  check("agent off: no steps, normal provider", r.status === 200 && r.steps.length === 0 && r.provider !== "agent", `${r.status} ${r.provider} ${r.steps.length}`);
} finally {
  await admin.from("conversations").delete().eq("user_id", data.user.id);
  await admin.auth.admin.deleteUser(data.user.id);
}
console.log(`\n${pass}/${total} passed`);
process.exit(pass === total ? 0 : 1);
