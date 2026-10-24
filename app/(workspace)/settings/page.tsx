import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGuest } from "@/lib/auth";
import { LockedFeature } from "@/components/shared/locked-feature";
import { ApiKeyManager } from "@/components/shared/api-key-manager";
import { ProfileSettings } from "@/components/shared/profile-settings";
import { ConnectorGrid } from "@/components/connectors/connector-grid";
import { getConnectorStatuses } from "@/lib/connectors/oauth";

// Server action: full account wipe. FK cascades from auth.users remove every
// table row (profiles, conversations→messages, documents→chunks, mood logs,
// journals, insights, qa_artifacts, code_docs, user_api_keys). Storage objects
// don't cascade, so they're removed explicitly first.
async function deleteAccountAction(): Promise<void> {
  "use server";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (user.is_anonymous ?? false)) redirect("/login");

  const admin = createAdminClient();

  // 1. Storage: remove everything under the user's folder.
  const { data: objects } = await admin.storage
    .from("documents")
    .list(user.id, { limit: 1000 });
  if (objects && objects.length > 0) {
    await admin.storage
      .from("documents")
      .remove(objects.map((o) => `${user.id}/${o.name}`));
  }

  // 2. Auth user — every table cascades from this.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error("account_deletion_failed");

  // 3. Clear the local session cookies.
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (isGuest(user)) {
    return (
      <LockedFeature
        feature="Settings"
        description="Settings are saved to your account so they follow you across devices. Save your account to unlock — your guest chats come with you."
        testID="settings-locked-panel"
      />
    );
  }

  const [{ data: profile }, connectorStatuses] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, avatar_url, theme_pref, voice_lang_pref, wellness_enabled")
      .eq("id", user.id)
      .maybeSingle(),
    getConnectorStatuses(supabase),
  ]);

  return (
    // flex + order: ProfileSettings' danger zone is pinned last via `order-last`.
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
      </header>
      <ProfileSettings
        userId={user.id}
        profile={
          profile ?? {
            display_name: null,
            avatar_url: null,
            theme_pref: "dark",
            voice_lang_pref: "en-IN",
            wellness_enabled: false,
          }
        }
        deleteAccount={deleteAccountAction}
      />
      <ApiKeyManager />
      <ConnectorGrid statuses={connectorStatuses} />
    </main>
  );
}
