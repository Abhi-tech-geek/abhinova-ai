import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client. SERVER-ONLY, bypasses RLS — use rarely and deliberately
// (e.g. storage cleanup jobs). Never import from client components.
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("Admin client must never run in the browser");
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
