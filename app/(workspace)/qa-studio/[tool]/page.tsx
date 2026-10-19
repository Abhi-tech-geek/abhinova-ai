import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getQaTool } from "@/lib/qa-tools";
import { ToolWorkspace } from "@/components/qa-studio/tool-workspace";
import type { QaArtifactRecord } from "@/types/qa";

export default async function QaToolPage({
  params,
}: {
  params: { tool: string };
}) {
  const tool = getQaTool(params.tool);
  if (!tool) notFound();

  // History for this tool — RLS scopes it to the signed-in user.
  const supabase = createClient();
  const { data: artifacts } = await supabase
    .from("qa_artifacts")
    .select("id, type, input, output, created_at")
    .eq("type", tool.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
      <div className="mb-6">
        <Link
          href="/qa-studio"
          className="text-xs text-muted-foreground hover:text-foreground"
          data-testid="qastudio-back-link"
        >
          ← All tools
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">
          <span className="mr-2">{tool.icon}</span>
          {tool.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
      </div>
      <ToolWorkspace
        tool={tool}
        history={(artifacts ?? []) as QaArtifactRecord[]}
      />
    </main>
  );
}
