// Visitors + activity per IST day from a start date (aggregates only, no content).
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SINCE = process.argv[3];
const day = (iso) => new Date(new Date(iso).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);

const users = [];
for (let page = 1; ; page++) {
  const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  users.push(...data.users);
  if (data.users.length < 1000) break;
}
const perDay = {};
for (const u of users.filter((u) => u.created_at >= SINCE)) perDay[day(u.created_at)] = (perDay[day(u.created_at)] ?? 0) + 1;
console.log("New visitors (guest sessions) per IST day:", JSON.stringify(perDay));
const lastSeen = users.filter((u) => (u.last_sign_in_at ?? "") >= SINCE).length;
console.log("Guests seen since then (incl. returning):", lastSeen);

const { data: convs } = await admin.from("conversations").select("mode, project_id, created_at, user_id").gte("created_at", SINCE);
console.log("Conversations since:", (convs ?? []).map((c) => `${day(c.created_at)} ${c.project_id ? "project" : c.mode}`).join(", ") || "none");
const { data: msgs } = await admin.from("messages").select("role, created_at, conversation_id").gte("created_at", SINCE);
const byConv = {};
for (const m of msgs ?? []) { const k = m.conversation_id.slice(0, 4); byConv[k] ??= { user: 0, assistant: 0, day: day(m.created_at) }; byConv[k][m.role]++; }
console.log("Messages per conversation (user/assistant):", JSON.stringify(Object.values(byConv)));
for (const t of ["qa_artifacts", "documents", "projects", "feedback"]) {
  const { count } = await admin.from(t).select("*", { count: "exact", head: true }).gte("created_at", SINCE);
  console.log(`${t} since: ${count}`);
}
