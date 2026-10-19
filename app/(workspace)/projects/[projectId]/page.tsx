import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isGuest } from "@/lib/auth";
import { projectIdSchema } from "@/lib/validators/projects";
import { loadProjectDetail } from "@/lib/projects/scope";
import { getConnectorStatuses } from "@/lib/connectors/oauth";
import { ProjectHeader } from "@/components/projects/project-header";
import { KnowledgePanel } from "@/components/projects/knowledge-panel";
import { ProjectInstructions } from "@/components/projects/project-instructions";
import { ProjectNotes } from "@/components/projects/project-notes";
import { ProjectChatList } from "@/components/projects/project-chat-list";

export default async function ProjectHomePage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { connected?: string; connector_error?: string };
}) {
  const id = projectIdSchema.safeParse(params.projectId);
  if (!id.success) notFound();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [detail, statuses] = await Promise.all([
    loadProjectDetail(supabase, id.data),
    getConnectorStatuses(supabase),
  ]);
  if (!detail) notFound();

  const connectorMessage = searchParams.connected
    ? { ok: true, text: `Connected ${searchParams.connected} — now add it as a source below.` }
    : searchParams.connector_error
      ? { ok: false, text: `Couldn't connect (${searchParams.connector_error.replace(/_/g, " ")}).` }
      : null;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <ProjectHeader project={detail.project} documentCount={detail.documents.length} />

      {connectorMessage && (
        <p
          className={`rounded-xl border px-4 py-2 text-xs ${connectorMessage.ok ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive"}`}
          data-testid="projects-connector-message"
        >
          {connectorMessage.text}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <KnowledgePanel
            projectId={detail.project.id}
            documents={detail.documents}
            sources={detail.sources}
            statuses={statuses}
            isGuest={isGuest(user)}
          />
          <ProjectChatList projectId={detail.project.id} chats={detail.chats} />
        </div>
        <div className="min-w-0 space-y-6">
          <ProjectInstructions projectId={detail.project.id} initial={detail.project.custom_instructions ?? ""} />
          <ProjectNotes projectId={detail.project.id} initial={detail.notes} />
        </div>
      </div>
    </main>
  );
}
