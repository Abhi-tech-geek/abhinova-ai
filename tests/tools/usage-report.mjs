// Read-only usage + feedback report for the owner (service role). Prints
// aggregates and feedback text only — no ids, emails or IPs.
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SINCE = process.argv[3] ?? "2026-10-24T00:00:00Z";
const day = (iso) => new Date(new Date(iso).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10); // IST date

// Users (auth): page through all, keep those created since SINCE.
const users = [];
for (let page = 1; ; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  users.push(...data.users);
  if (data.users.length < 1000) break;
}
const recent = users.filter((u) => u.created_at >= SINCE);
console.log(`== Accounts: ${users.length} total, ${recent.length} created since ${SINCE.slice(0, 10)} (anonymous guests: ${recent.filter((u) => u.is_anonymous).length})`);

// Who actually did something: users with at least one stored message / QA run / doc.
async function rows(table, cols, filter = (q) => q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(admin.from(table).select(cols)).gte("created_at", SINCE).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
const msgs = await rows("messages", "user_id, role, created_at, conversation_id");
const convs = await rows("conversations", "user_id, mode, project_id, created_at");
const qa = await rows("qa_artifacts", "user_id, type, created_at");
const docs = await rows("documents", "user_id, file_type, status, created_at");
const projects = await rows("projects", "user_id, created_at");
const activeUsers = new Set([...msgs.filter((m) => m.role === "user"), ...qa, ...docs].map((r) => r.user_id));
console.log(`== Active users (sent a message / ran QA / uploaded): ${activeUsers.size}`);

const byDay = {};
for (const m of msgs.filter((m) => m.role === "user")) { (byDay[day(m.created_at)] ??= { msgs: 0, users: new Set() }).msgs++; byDay[day(m.created_at)].users.add(m.user_id); }
for (const q of qa) { (byDay[day(q.created_at)] ??= { msgs: 0, users: new Set() }).qa = (byDay[day(q.created_at)].qa ?? 0) + 1; byDay[day(q.created_at)].users.add(q.user_id); }
console.log("== Per day (IST): user messages · QA runs · active users");
for (const d of Object.keys(byDay).sort()) console.log(`   ${d}: ${byDay[d].msgs} msgs · ${byDay[d].qa ?? 0} QA · ${byDay[d].users.size} users`);

const modes = convs.reduce((a, c) => ((a[c.project_id ? "project chat" : c.mode] = (a[c.project_id ? "project chat" : c.mode] ?? 0) + 1), a), {});
console.log(`== Conversations started: ${convs.length}`, JSON.stringify(modes));
const qaTypes = qa.reduce((a, q) => ((a[q.type] = (a[q.type] ?? 0) + 1), a), {});
console.log(`== QA runs: ${qa.length}`, JSON.stringify(qaTypes));
console.log(`== Documents: ${docs.length}`, JSON.stringify(docs.reduce((a, d) => ((a[d.file_type] = (a[d.file_type] ?? 0) + 1), a), {})), `· Projects: ${projects.length}`);

// Site-wide AI calls per day from the beta counters.
const { data: site } = await admin.from("beta_usage").select("bucket, used").eq("subject", "site").like("bucket", "ai:%").order("bucket");
console.log("== Site AI calls per day (UTC):", (site ?? []).filter((s) => s.bucket.slice(3) >= SINCE.slice(0, 10)).map((s) => `${s.bucket.slice(3)}=${s.used}`).join("  "));

// Feedback (all of it — usually small).
const { data: fb, error: fbErr } = await admin.from("feedback").select("created_at, category, message, page, is_guest").order("created_at", { ascending: false }).limit(50);
if (fbErr) throw fbErr;
console.log(`\n== Feedback: ${fb.length} total`);
for (const f of fb) console.log(`   [${day(f.created_at)}] ${f.category.toUpperCase()} on ${f.page ?? "?"}: ${f.message.replace(/\s+/g, " ").slice(0, 300)}`);
