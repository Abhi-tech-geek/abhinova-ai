import {
  getAuthenticatedUser,
  UnauthorizedError,
  unauthorizedResponse,
  isGuest,
} from "@/lib/auth";
import { codeDocsRequestSchema } from "@/lib/validators/code";
import { checkRateLimit, AI_REQUESTS_PER_MINUTE } from "@/lib/rate-limit";
import { completeChat } from "@/lib/ai/router";
import { resolveModel } from "@/lib/models/byok";
import {
  CODE_DOCS_SYSTEM_PROMPT,
  CODE_DOCS_PROMPTS,
} from "@/lib/ai/prompts/code-agent";
import { scanFile } from "@/lib/code/secret-scan";
import { buildFileContext } from "@/lib/code/project-index";
import { getOwnedProject } from "@/lib/projects/scope";
import { ingestBlocks } from "@/lib/rag/ingest";
import { createClient } from "@/lib/supabase/server";
import type { AiMessage } from "@/types/chat";
import { isOpenBeta } from "@/lib/beta/config";
import { enforceBetaQuota } from "@/lib/beta/quota";

// PRD / TRD / architecture / API-spec generation. Markdown out, saved to
// code_docs (RLS). Writing into the local project goes through the
// diff-review flow. With projectId, the doc is also saved into that project
// AND indexed into its knowledge base so project chats can answer from it.
export async function POST(request: Request): Promise<Response> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
  if (isGuest(user) && !isOpenBeta()) {
    return Response.json({ error: "guest_not_allowed" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = codeDocsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const { docType, description, files, modelId } = parsed.data;

  const rl = await checkRateLimit(`code:${user.id}`, AI_REQUESTS_PER_MINUTE);
  if (!rl.allowed) {
    return Response.json(
      { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429 }
    );
  }
  const quotaBlocked = await enforceBetaQuota(user, request, ["ai"]);
  if (quotaBlocked) return quotaBlocked;

  const blocked = files
    .map((f) => ({ path: f.path, scan: scanFile(f.path, f.content) }))
    .filter((f) => f.scan.blocked);
  if (blocked.length > 0) {
    return Response.json(
      {
        error: "secret_files_blocked",
        blocked: blocked.map((b) => ({ path: b.path, reason: b.scan.reason })),
      },
      { status: 400 }
    );
  }

  const resolved = modelId ? await resolveModel(modelId) : null;
  if (modelId && !resolved) {
    return Response.json({ error: "unknown_model" }, { status: 400 });
  }

  const messages: AiMessage[] = [
    { role: "system", content: `${CODE_DOCS_SYSTEM_PROMPT}\n\n${CODE_DOCS_PROMPTS[docType]}` },
    {
      role: "user",
      content: `${files.length > 0 ? `${buildFileContext(files)}\n\n` : ""}Feature/product description:\n${description}`,
    },
  ];

  try {
    const { text } = await completeChat(messages, request.signal, resolved);
    const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? `${docType.toUpperCase()} document`;

    const supabase = createClient();
    const project = parsed.data.projectId
      ? await getOwnedProject(supabase, parsed.data.projectId)
      : null;

    const { data: doc } = await supabase
      .from("code_docs")
      .insert({
        user_id: user.id,
        doc_type: docType,
        title,
        content: text,
        ...(project ? { project_id: project.id } : {}),
      })
      .select("id")
      .single();

    let savedToProject = false;
    if (project) {
      const { data: kbDoc } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          project_id: project.id,
          file_name: `${title.slice(0, 110)}.md`,
          file_type: "md",
          status: "processing",
        })
        .select("id")
        .single();
      if (kbDoc) {
        try {
          await ingestBlocks(supabase, {
            userId: user.id,
            documentId: kbDoc.id as string,
            blocks: [{ text, metadata: {} }],
          });
          await supabase.from("documents").update({ status: "ready" }).eq("id", kbDoc.id);
          savedToProject = true;
        } catch {
          await supabase.from("documents").update({ status: "failed" }).eq("id", kbDoc.id);
        }
      }
    }

    return Response.json({ markdown: text, title, docId: doc?.id ?? null, savedToProject });
  } catch {
    return Response.json({ error: "ai_unavailable" }, { status: 502 });
  }
}
