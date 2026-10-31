// Read-only abuse check (aggregates only — no message content, no raw IPs).
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SINCE_DAY = process.argv[3]; // e.g. 2026-10-26

const { data: rows } = await admin.from("beta_usage").select("subject, bucket, used, updated_at").gte("updated_at", `${SINCE_DAY}T00:00:00Z`);
const ip = (rows ?? []).filter((r) => r.subject.startsWith("ip:") && r.bucket.startsWith("ai:"));
const users = (rows ?? []).filter((r) => r.subject.startsWith("user:"));
console.log(`AI calls per network (IP hash) per day since ${SINCE_DAY} — limit 75:`);
for (const r of ip.sort((a, b) => b.used - a.used).slice(0, 8)) console.log(`  network #${r.subject.slice(3, 9)} · ${r.bucket.slice(3)} · ${r.used} calls`);
const hitLimit = users.filter((r) => (r.bucket.startsWith("ai:") && r.used >= 25) || (r.bucket === "chat" && r.used >= 2) || (r.bucket.startsWith("qa:") && r.used >= 5) || (r.bucket === "doc" && r.used >= 2));
console.log(`Users who hit a beta limit since ${SINCE_DAY}: ${hitLimit.length}`, hitLimit.map((r) => `${r.bucket}=${r.used}`).join(", "));
const { data: site } = await admin.from("beta_usage").select("bucket, used").eq("subject", "site").gte("bucket", `ai:${SINCE_DAY}`);
console.log("Site AI calls per day:", (site ?? []).map((s) => `${s.bucket.slice(3)}=${s.used}`).join("  ") || "none");

const since = `${SINCE_DAY}T00:00:00Z`;
for (const t of ["conversations", "documents", "projects", "qa_artifacts", "user_api_keys", "connector_accounts", "feedback"]) {
  const { count } = await admin.from(t).select("*", { count: "exact", head: true }).gte("created_at", since);
  console.log(`${t} created since: ${count}`);
}
const { data: docs } = await admin.from("documents").select("file_type, status").gte("created_at", since);
console.log("documents detail:", JSON.stringify(docs));
