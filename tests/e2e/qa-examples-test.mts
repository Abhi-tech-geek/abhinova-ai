// Every QA Studio "Try an example" input must produce a valid result.
// Usage: npx tsx --import ./tests/e2e/xff.mjs tests/e2e/qa-examples-test.mts <.env.local> <appUrl>
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { QA_TOOLS } from "@/lib/qa-tools";

const env = Object.fromEntries(
  fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const B = process.argv[3];
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(SUPA).hostname.split(".")[0];
const admin = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function guest() {
  const sb = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInAnonymously();
  if (error || !data.session || !data.user) throw error ?? new Error("no session");
  const v = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  return { id: data.user.id, cookie: `sb-${ref}-auth-token=${v}` };
}

const guests = [await guest(), await guest()]; // 5 QA runs per guest per day
let pass = 0;
for (const [i, tool] of QA_TOOLS.entries()) {
  const g = guests[i < 5 ? 0 : 1];
  const t0 = Date.now();
  const options = tool.select ? { [tool.select.key]: tool.select.options[0].value } : undefined;
  const r = await fetch(`${B}/api/qa/${tool.id}`, {
    method: "POST",
    headers: { cookie: g.cookie, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 Chrome/130" },
    body: JSON.stringify({ input: tool.example, ...(options ? { options } : {}) }),
  });
  const j = (await r.json().catch(() => ({}))) as { output?: unknown; error?: string };
  const ok = r.status === 200 && !!j.output;
  if (ok) pass++;
  console.log(`${ok ? "PASS" : "FAIL"} ${tool.id} · ${r.status} · ${((Date.now() - t0) / 1000).toFixed(1)}s · ${JSON.stringify(j.output ?? j).slice(0, 110)}`);
}
for (const g of guests) {
  await admin.from("qa_artifacts").delete().eq("user_id", g.id);
  await admin.auth.admin.deleteUser(g.id);
}
console.log(`\n${pass}/${QA_TOOLS.length} examples produced a valid result (test guests deleted)`);
