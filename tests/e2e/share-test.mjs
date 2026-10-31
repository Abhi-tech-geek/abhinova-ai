// Share-by-link (migration 006): owner-only create/stop, public read-only page,
// no Wellness sharing, no cross-user control.
// Usage: node --import ./tests/e2e/xff.mjs tests/e2e/share-test.mjs <.env.local> <appUrl>
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
  const sb = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  const v = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const parts = [];
  for (let i = 0; i * 3180 < v.length; i++) parts.push(`sb-${ref}-auth-token${v.length > 3180 ? "." + i : ""}=${v.slice(i * 3180, (i + 1) * 3180)}`);
  const db = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${data.session.access_token}` } } });
  return { id: data.user.id, H: { cookie: parts.join("; "), "User-Agent": "Mozilla/5.0 Chrome/130" }, db };
}
const share = (g, conv, method) => fetch(`${B}/api/conversations/${conv}/share`, { method, headers: g.H });

const A = await guest();
const Bg = await guest();
const { data: conv } = await A.db.from("conversations").insert({ user_id: A.id, title: "Chai break plan", mode: "workspace" }).select("id").single();
await A.db.from("messages").insert([
  { conversation_id: conv.id, user_id: A.id, role: "user", content: "When is the chai break?" },
  { conversation_id: conv.id, user_id: A.id, role: "assistant", content: "The chai break is at **4:15 PM** every day." },
]);
const { data: wconv } = await A.db.from("conversations").insert({ user_id: A.id, title: "Wellness session", mode: "wellness" }).select("id").single();

let r = await share(A, conv.id, "GET");
let j = await r.json();
check("status before sharing: not shared", r.status === 200 && j.shared === false, `${r.status} ${JSON.stringify(j)}`);
r = await share(A, conv.id, "POST");
j = await r.json();
const shareId = j.shareId;
check("owner creates a link", (r.status === 201 || r.status === 200) && !!shareId, `${r.status} ${JSON.stringify(j)}`);
r = await share(A, conv.id, "POST");
check("creating again returns the same link", (await r.json()).shareId === shareId);

let page = await fetch(`${B}/share/${shareId}`, { headers: { "User-Agent": "Mozilla/5.0 Chrome/130" }, redirect: "manual" });
let html = await page.text();
check("anyone (no login) can read the shared chat", page.status === 200 && html.includes("Chai break plan") && html.includes("4:15 PM"), page.status);
check("viewing a share doesn't create a guest session", !(page.headers.get("set-cookie") ?? "").includes("sb-"));
check("shared page is noindex", /noindex/.test(html));

r = await share(Bg, conv.id, "POST");
check("another user can't share my chat", r.status === 403, r.status);
r = await share(Bg, conv.id, "DELETE");
page = await fetch(`${B}/share/${shareId}`, { headers: { "User-Agent": "Mozilla/5.0 Chrome/130" } });
check("another user can't stop my share", page.status === 200, page.status);
r = await share(A, wconv.id, "POST");
check("wellness chats can't be shared", r.status === 403, r.status);
const rpc = await createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).rpc("get_shared_chat", { p_share_id: crypto.randomUUID() });
check("unknown share id returns nothing", !rpc.error && (rpc.data ?? []).length === 0, JSON.stringify(rpc.error));

r = await share(A, conv.id, "DELETE");
page = await fetch(`${B}/share/${shareId}`, { headers: { "User-Agent": "Mozilla/5.0 Chrome/130" } });
check("after Stop sharing the link is dead (404)", r.status === 200 && page.status === 404, `${r.status} ${page.status}`);
page = await fetch(`${B}/share/not-a-uuid`, { headers: { "User-Agent": "Mozilla/5.0 Chrome/130" } });
check("malformed share id → 404", page.status === 404, page.status);

for (const g of [A, Bg]) {
  await admin.from("conversations").delete().eq("user_id", g.id);
  await admin.auth.admin.deleteUser(g.id);
}
console.log(`\n${pass}/${total} passed (test guests deleted)`);
