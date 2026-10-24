import type { Metadata } from "next";
import { AdminLogin } from "@/components/admin/admin-login";
import { UsageDashboard } from "@/components/admin/usage-dashboard";
import { isAdminConfigured, isAdminSession } from "@/lib/admin/auth";
import { BETA_LIMITS } from "@/lib/beta/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { dashboardRangeSchema } from "@/lib/validators/admin";
import type { UsageStats } from "@/types/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Usage dashboard · AbhiNova AI",
  robots: { index: false, follow: false },
};

// Owner-only usage dashboard. Access = ADMIN_DASHBOARD_TOKEN cookie (see
// lib/admin/auth.ts); stats come from the service-role-only
// admin_usage_stats() function — aggregates only.
export default async function AdminPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ days?: string; error?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  if (!(await isAdminSession())) {
    return <AdminLogin error={searchParams.error} configured={isAdminConfigured()} />;
  }

  const days = dashboardRangeSchema.parse(searchParams.days);
  const { data, error } = await createAdminClient().rpc("admin_usage_stats", {
    p_days: days,
    p_ai_user_cap: BETA_LIMITS.aiCallsPerUserPerDay,
    p_ai_ip_cap: BETA_LIMITS.aiCallsPerIpPerDay,
    p_ai_site_cap: BETA_LIMITS.aiCallsSitePerDay,
    p_chat_cap: BETA_LIMITS.chats,
    p_qa_cap: BETA_LIMITS.qaRunsPerDay,
    p_doc_cap: BETA_LIMITS.documents,
  });

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4" data-testid="admin-stats-error">
        <div className="glass max-w-md rounded-2xl p-6 text-center">
          <h1 className="font-display text-lg font-semibold">Stats unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Couldn&apos;t load usage numbers. Has <code className="font-mono text-xs">supabase/migrations/005_admin_stats.sql</code> been run?
          </p>
        </div>
      </main>
    );
  }

  return <UsageDashboard stats={data as UsageStats} />;
}
