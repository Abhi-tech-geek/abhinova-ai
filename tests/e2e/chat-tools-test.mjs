// Reply actions + chat search: reply id header, regenerate (replaces the reply,
// never duplicates the question), 👍/👎 (works once migration 007 is run),
// search by title / message text, owner-only everywhere.
// Usage: node --import ./tests/e2e/xff.mjs tests/e2e/chat-tools-test.mjs <.env.local> <appUrl>
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
const get = (g, path) => fetch(`${B}${path}`, { headers: g.H });
const msgs = async (conv) => (await admin.from("messages").select("id, role, content").eq("conversation_id", conv).order("created_at")).data ?? [];

const A = await guest();
const Bg = await guest();
try {
  let r = await post(A, "/api/chat", { message: "Reply with exactly: zebra-kiwi-42" });
  await r.text();
  const conv = r.headers.get("X-Conversation-Id");
  const replyId = r.headers.get("X-Assistant-Message-Id");
  let rows = await msgs(conv);
  check("reply id is sent up front and used for the saved reply", !!replyId && rows.some((m) => m.id === replyId && m.role === "assistant"), JSON.stringify(rows.map((m) => m.role)));

  r = await post(A, "/api/chat", { message: "ignored", conversationId: conv, regenerate: true });
  await r.text();
  const newReplyId = r.headers.get("X-Assistant-Message-Id");
  rows = await msgs(conv);
  check("regenerate replaces the reply", r.status === 200 && !rows.some((m) => m.id === replyId) && rows.some((m) => m.id === newReplyId), JSON.stringify(rows.map((m) => [m.role, m.id.slice(0, 6)])));
  check("regenerate keeps one question (no duplicate, body text ignored)", rows.filter((m) => m.role === "user").length === 1 && rows[0].content.startsWith("Reply with exactly"), JSON.stringify(rows.map((m) => m.content.slice(0, 20))));
  check("regenerate needs a conversation", (await post(A, "/api/chat", { message: "x", regenerate: true })).status === 400);
  check("someone else can't regenerate my chat", (await post(Bg, "/api/chat", { message: "x", conversationId: conv, regenerate: true })).status === 404);

  r = await post(A, `/api/messages/${newReplyId}/feedback`, { rating: 1 });
  if (r.status === 503) {
    console.log("NOTE  migration 007 not run yet — rating checks limited");
    check("ratings before migration 007 → clear 503", (await r.json()).error === "feedback_not_set_up");
  } else {
    const { data: fb } = await admin.from("message_feedback").select("rating").eq("message_id", newReplyId);
    check("👍 saved", r.status === 200 && fb?.[0]?.rating === 1, `${r.status} ${JSON.stringify(fb)}`);
    r = await post(A, `/api/messages/${newReplyId}/feedback`, { rating: -1 });
    const { data: fb2 } = await admin.from("message_feedback").select("rating").eq("message_id", newReplyId);
    check("changing to 👎 updates the same row", r.status === 200 && fb2?.length === 1 && fb2[0].rating === -1, JSON.stringify(fb2));
    check("someone else can't rate my reply", (await post(Bg, `/api/messages/${newReplyId}/feedback`, { rating: 1 })).status === 403);
    check("a question (not a reply) can't be rated", (await post(A, `/api/messages/${rows[0].id}/feedback`, { rating: 1 })).status === 403);
    r = await post(A, `/api/messages/${newReplyId}/feedback`, { rating: 0 });
    const { data: fb3 } = await admin.from("message_feedback").select("rating").eq("message_id", newReplyId);
    check("rating 0 clears it", r.status === 200 && fb3?.length === 0);
  }
  check("bad rating → 400", (await post(A, `/api/messages/${newReplyId}/feedback`, { rating: 5 })).status === 400);

  await admin.from("conversations").update({ title: "Payments regression plan" }).eq("id", conv);
  await admin.from("messages").insert({ conversation_id: conv, user_id: A.id, role: "user", content: "The 50% discount coupon breaks checkout on Safari" });
  const { data: well } = await admin.from("conversations").insert({ user_id: A.id, title: "Payments worries", mode: "wellness" }).select("id").single();
  let s = await (await get(A, "/api/conversations/search?q=payments")).json();
  check("search finds a chat by title", s.results?.some((c) => c.id === conv), JSON.stringify(s));
  check("wellness chats never show in search", !s.results?.some((c) => c.id === well.id));
  s = await (await get(A, "/api/conversations/search?q=coupon%20breaks")).json();
  const hit = s.results?.find((c) => c.id === conv);
  check("search finds a chat by message text, with a snippet", !!hit && /coupon breaks/i.test(hit.snippet ?? ""), JSON.stringify(s));
  s = await (await get(A, `/api/conversations/search?q=${encodeURIComponent("50%")}`)).json();
  check("% is matched literally (no wildcard)", s.results?.some((c) => c.id === conv) && s.results.length === 1, JSON.stringify(s));
  s = await (await get(A, `/api/conversations/search?q=${encodeURIComponent("%%")}`)).json();
  check("'%%' doesn't match everything", (s.results ?? []).length === 0, JSON.stringify(s));
  s = await (await get(Bg, "/api/conversations/search?q=payments")).json();
  check("someone else's chats never show up", !(s.results ?? []).some((c) => c.id === conv));
  check("1-letter query → no search", ((await (await get(A, "/api/conversations/search?q=p")).json()).results ?? []).length === 0);
  check("search signed out → 401", (await fetch(`${B}/api/conversations/search?q=payments`, { headers: { "User-Agent": "Mozilla/5.0 Chrome/130" } })).status === 401);
} finally {
  for (const g of [A, Bg]) await admin.auth.admin.deleteUser(g.id);
}
console.log(`\n${pass}/${total} passed`);
process.exit(pass === total ? 0 : 1);
