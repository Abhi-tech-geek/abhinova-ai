import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { projectIdSchema } from "@/lib/validators/projects";
import { conversationIdSchema } from "@/lib/validators/chat";
import { getOwnedProject, countProjectDocuments } from "@/lib/projects/scope";
import { ChatPanel } from "@/components/workspace/chat-panel";
import { ProjectSwitcher } from "@/components/projects/project-switcher";
import type { ChatMessageRecord } from "@/types/chat";

// Project chat — same premium chat UI, scoped to one project's knowledge.
// conversationId "new" = fresh chat; the first reply creates the conversation
// inside this project and navigates to its real id.
export default async function ProjectChatPage({
  params,
}: {
  params: { projectId: string; conversationId: string };
}) {
  const projectId = projectIdSchema.safeParse(params.projectId);
  if (!projectId.success) notFound();

  const supabase = createClient();
  const project = await getOwnedProject(supabase, projectId.data);
  if (!project) notFound();

  let conversationId: string | null = null;
  let messages: ChatMessageRecord[] = [];
  if (params.conversationId !== "new") {
    const parsed = conversationIdSchema.safeParse(params.conversationId);
    if (!parsed.success) notFound();
    // RLS + explicit project match: a chat from another project 404s here.
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", parsed.data)
      .eq("project_id", project.id)
      .maybeSingle();
    if (!conversation) notFound();
    conversationId = conversation.id as string;
    const { data } = await supabase
      .from("messages")
      .select("id, role, content, created_at, metadata")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    messages = (data ?? []) as ChatMessageRecord[];
  }

  const documentCount = await countProjectDocuments(supabase, project.id);

  const contextBar = (
    <div className="flex min-w-0 items-center gap-3 border-b border-border/60 bg-card/30 px-4 py-2 backdrop-blur" data-testid="projects-chat-context-bar">
      <ProjectSwitcher currentId={project.id} currentName={project.name} currentIcon={project.icon} />
      {/* Short label on phones, full sentence from sm up. */}
      <span className="min-w-0 truncate text-[11px] text-muted-foreground" data-testid="projects-chat-doc-count">
        {documentCount > 0 ? (
          <>
            <span className="sm:hidden">📚 {documentCount} doc{documentCount === 1 ? "" : "s"}</span>
            <span className="hidden sm:inline">
              Answering from {documentCount} document{documentCount === 1 ? "" : "s"} in this project
            </span>
          </>
        ) : (
          <>
            <span className="sm:hidden">No docs yet</span>
            <span className="hidden sm:inline">No documents yet — answering as a normal chat</span>
          </>
        )}
      </span>
      <span className="flex-1" />
      <Link
        href={`/projects/${project.id}`}
        aria-label="Project home"
        className="shrink-0 whitespace-nowrap text-[11px] text-primary hover:underline"
        data-testid="projects-chat-open-project"
      >
        <span className="hidden sm:inline">Project home </span>→
      </Link>
    </div>
  );

  const emptyState = (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <span className="glass grid h-16 w-16 place-items-center rounded-2xl text-3xl">{project.icon}</span>
      <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">{project.name}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {documentCount > 0
          ? "Ask anything — answers come from this project's knowledge, with citations."
          : "This project has no knowledge yet. You can still chat, or add files from the project home."}
      </p>
    </div>
  );

  return (
    <ChatPanel
      key={conversationId ?? "new"}
      conversationId={conversationId}
      initialMessages={messages}
      projectId={project.id}
      basePath={`/projects/${project.id}/chat`}
      header={contextBar}
      emptyState={emptyState}
    />
  );
}
