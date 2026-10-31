// Can guest B pull guest A's chunks through the similarity-search RPC?
// A uploads + processes a doc via the app; B calls match_document_chunks
// directly against Supabase (no app in between), with and without A's doc id.
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const B = process.argv[3];
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const ref = new URL(SUPA).hostname.split(".")[0];
const admin = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function guest() {
  const sb = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  const v = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const parts = [];
  for (let i = 0; i * 3180 < v.length; i++) parts.push(`sb-${ref}-auth-token${v.length > 3180 ? "." + i : ""}=${v.slice(i * 3180, (i + 1) * 3180)}`);
  const asUser = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${data.session.access_token}` } } });
  return { id: data.user.id, cookie: parts.join("; "), db: asUser };
}

const A = await guest();
const Bg = await guest();
const fd = new FormData();
fd.append("file", new Blob(["Secret plan of guest A: launch on Friday at 9 PM."], { type: "text/plain" }), "a-secret.txt");
const up = await (await fetch(B + "/api/documents/upload", { method: "POST", headers: { cookie: A.cookie }, body: fd })).json();
const pr = await (await fetch(B + "/api/documents/process", { method: "POST", headers: { cookie: A.cookie, "Content-Type": "application/json" }, body: JSON.stringify({ documentId: up.documentId }) })).json();
console.log("A's doc processed:", pr.status, "chunks:", pr.chunkCount);

// Use A's real stored embedding as the query, the strongest possible match.
const { data: row } = await admin.from("document_chunks").select("embedding").eq("document_id", up.documentId).limit(1).single();
const qvec = typeof row.embedding === "string" ? JSON.parse(row.embedding) : row.embedding;

const ownA = await A.db.rpc("match_document_chunks", { query_embedding: qvec, match_count: 5, filter_document_ids: [up.documentId] });
console.log(`A searches own doc        → ${ownA.data?.length ?? 0} rows ${ownA.error ? "(err " + ownA.error.message + ")" : ""}`);
const byId = await Bg.db.rpc("match_document_chunks", { query_embedding: qvec, match_count: 5, filter_document_ids: [up.documentId] });
console.log(`B searches with A's doc id → ${byId.data?.length ?? 0} rows ${byId.error ? "(err " + byId.error.message + ")" : ""}`);
const open = await Bg.db.rpc("match_document_chunks", { query_embedding: qvec, match_count: 50, filter_document_ids: null });
const leaked = (open.data ?? []).filter((r) => String(r.document_id) === up.documentId).length;
console.log(`B searches everything      → ${open.data?.length ?? 0} rows, ${leaked} from A ${open.error ? "(err " + open.error.message + ")" : ""}`);
const direct = await Bg.db.from("document_chunks").select("id").eq("document_id", up.documentId);
console.log(`B reads A's chunks table   → ${direct.data?.length ?? 0} rows`);
const defCall = await Bg.db.rpc("consume_beta_quota", { p_items: [] });
console.log(`B calls a SECURITY DEFINER fn → ${defCall.error ? "blocked: " + defCall.error.code : "ALLOWED"}`);

for (const g of [A, Bg]) {
  const { data: files } = await admin.storage.from("documents").list(g.id);
  if (files?.length) await admin.storage.from("documents").remove(files.map((f) => `${g.id}/${f.name}`));
  await admin.auth.admin.deleteUser(g.id);
}
const pass = (ownA.data?.length ?? 0) > 0 && (byId.data?.length ?? 0) === 0 && leaked === 0 && (direct.data?.length ?? 0) === 0 && !!defCall.error;
console.log(pass ? "\nRESULT: isolated ✅" : "\nRESULT: LEAK ❌");
