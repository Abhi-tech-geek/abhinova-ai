import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isGuest } from "@/lib/auth";
import { Sidebar, type SidebarData } from "@/components/workspace/sidebar";
import { GuestBanner } from "@/components/workspace/guest-banner";
import { CommandPalette } from "@/components/shared/command-palette";
import { WelcomeTour } from "@/components/shared/welcome-tour";
import { getQaTool } from "@/lib/qa-tools";
import type { ConversationRecord } from "@/types/chat";

// Auth-protected workspace shell (middleware redirects too — defense in depth).
// Layout (Claude/ChatGPT style): one sidebar = New + Search + feature nav +
// the current feature's history + account menu (theme, wellness, sign out).
// No top bar — content gets the full height.
export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: conversations },
    { data: profile },
    { data: qaArtifacts },
    { data: codeDocs },
    { data: documents },
    { data: projects },
    { data: projectChats },
  ] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, title, mode, updated_at")
      .eq("mode", "workspace")
      .is("project_id", null) // project chats live under their project
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase
      .from("profiles")
      .select("wellness_enabled, display_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("qa_artifacts")
      .select("id, type, input, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("code_docs")
      .select("id, title, doc_type, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("documents")
      .select("id, file_name, status, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("projects")
      .select("id, name, icon, is_archived, updated_at")
      .eq("is_archived", false)
      .order("updated_at", { ascending: false })
      .limit(30),
    supabase
      .from("conversations")
      .select("id, title, project_id, updated_at")
      .not("project_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(60),
  ]);

  const sidebarData: SidebarData = {
    conversations: (conversations ?? []) as ConversationRecord[],
    qaSessions: (qaArtifacts ?? []).map((a) => ({
      id: a.id as string,
      title: (a.input as string).slice(0, 60) || "QA run",
      href: `/qa-studio/${a.type}`,
      createdAt: a.created_at as string,
      icon: getQaTool(a.type as string)?.icon ?? "🧪",
    })),
    codeSessions: (codeDocs ?? []).map((d) => ({
      id: d.id as string,
      title: d.title as string,
      href: "/code-studio",
      createdAt: d.created_at as string,
      icon: "📐",
    })),
    projects: (projects ?? []).map((p) => ({
      id: p.id as string,
      title: p.name as string,
      href: `/projects/${p.id}`,
      createdAt: p.updated_at as string,
      icon: p.icon as string,
    })),
    projectChats: (projectChats ?? []).map((c) => ({
      id: c.id as string,
      title: c.title as string,
      href: `/projects/${c.project_id}/chat/${c.id}`,
      createdAt: c.updated_at as string,
      icon: "💬",
      projectId: c.project_id as string,
    })),
    docSessions: (documents ?? []).map((d) => ({
      id: d.id as string,
      title: d.file_name as string,
      href: "/documents",
      createdAt: d.created_at as string,
      icon: d.status === "ready" ? "📄" : d.status === "failed" ? "⚠️" : "⏳",
    })),
  };

  return (
    <div className="flex h-screen bg-background">
      <CommandPalette />
      <WelcomeTour />
      <Sidebar
        data={sidebarData}
        userEmail={user.email ?? null}
        displayName={(profile?.display_name as string | null) ?? null}
        isGuestUser={isGuest(user)}
        wellnessEnabled={profile?.wellness_enabled ?? false}
      />
      <div className="flex min-w-0 flex-1 flex-col pt-12 md:pt-0">
        {isGuest(user) && <GuestBanner />}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
