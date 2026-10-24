import {
  getAuthenticatedUser,
  UnauthorizedError,
  unauthorizedResponse,
  isGuest,
} from "@/lib/auth";
import {
  qaRequestSchema,
  qaToolIdSchema,
  QA_OUTPUT_SCHEMAS,
} from "@/lib/validators/qa";
import {
  checkRateLimit,
  AI_REQUESTS_PER_MINUTE,
  GUEST_AI_REQUESTS_PER_MINUTE,
} from "@/lib/rate-limit";
import { completeChat, extractJsonObject } from "@/lib/ai/router";
import { resolveModel } from "@/lib/models/byok";
import { QA_BASE_PROMPT, QA_TOOL_PROMPTS, QA_PROJECT_CONTEXT_NOTE } from "@/lib/ai/prompts/qa-tools";
import { formatProjectInstructions } from "@/lib/ai/prompts/project-agent";
import { getOwnedProject } from "@/lib/projects/scope";
import { retrieveChunks, buildDocumentContext } from "@/lib/rag/retrieve";
import { createClient } from "@/lib/supabase/server";
import { enforceBetaQuota } from "@/lib/beta/quota";
import type { AiMessage } from "@/types/chat";

export async function POST(
  request: Request,
  { params }: { params: { tool: string } }
): Promise<Response> {
  // 1. Auth
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }

  // 2. Validate tool + body
  const toolParsed = qaToolIdSchema.safeParse(params.tool);
  if (!toolParsed.success) {
    return Response.json({ error: "unknown_tool" }, { status: 404 });
  }
  const tool = toolParsed.data;

  const body = await request.json().catch(() => null);
  const parsed = qaRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const { input, options, projectId, modelId } = parsed.data;
  const resolved = modelId ? await resolveModel(modelId) : null;
  if (modelId && !resolved) {
    return Response.json({ error: "unknown_model" }, { status: 400 });
  }

  // 3. Rate limit (shared per-user AI window with chat-style limits)
  const rl = await checkRateLimit(
    `qa:${user.id}`,
    isGuest(user) ? GUEST_AI_REQUESTS_PER_MINUTE : AI_REQUESTS_PER_MINUTE
  );
  if (!rl.allowed) {
    return Response.json(
      { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }
  // Beta: one AI call + one of today's QA runs.
  const quotaBlocked = await enforceBetaQuota(user, request, ["ai", "qa"]);
  if (quotaBlocked) return quotaBlocked;

  // 4. Optional project scope: its instructions + the most relevant chunks.
  const supabase = createClient();
  let projectContext = "";
  let scopedProjectId: string | null = null;
  if (projectId) {
    const project = await getOwnedProject(supabase, projectId);
    if (!project) return Response.json({ error: "project_not_found" }, { status: 404 });
    scopedProjectId = project.id;
    const parts: string[] = [];
    if (project.custom_instructions?.trim()) {
      parts.push(formatProjectInstructions(project.custom_instructions.trim()));
    }
    try {
      const sources = await retrieveChunks(input.slice(0, 2000), null, project.id, 5);
      if (sources.length > 0) parts.push(buildDocumentContext(sources));
    } catch {
      // Retrieval outage — run the tool without project knowledge.
    }
    projectContext = parts.join("\n\n");
  }

  // 5. Build prompt — user input wrapped in delimiters as untrusted data
  const optionsText = options
    ? Object.entries(options)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")
    : "";
  const messages: AiMessage[] = [
    {
      role: "system",
      content: `${QA_BASE_PROMPT}\n\n${QA_TOOL_PROMPTS[tool]}${scopedProjectId ? `\n\n${QA_PROJECT_CONTEXT_NOTE}` : ""}`,
    },
    {
      role: "user",
      content: `${projectContext ? `${projectContext}\n\n` : ""}${optionsText ? `Options:\n${optionsText}\n\n` : ""}<user_input>\n${input}\n</user_input>`,
    },
  ];

  // 5. Generate → parse → one corrective retry on failure
  const schema = QA_OUTPUT_SCHEMAS[tool];
  let provider: string;
  let output: unknown = null;

  try {
    const first = await completeChat(messages, request.signal, resolved);
    provider = first.provider;
    output = tryParse(first.text, schema);

    // No JSON at all = the model declined under the safety rules. Show its
    // short refusal instead of retrying for JSON (audit bug B4).
    if (output === null && !first.text.includes("{")) {
      return Response.json(
        { error: "refused", message: first.text.trim().slice(0, 500) },
        { status: 422 }
      );
    }

    if (output === null) {
      const retry = await completeChat(
        [
          ...messages,
          { role: "assistant", content: first.text },
          {
            role: "user",
            content:
              "Your previous response was not valid JSON matching the required schema. Respond again with ONLY the corrected JSON object — no fences, no commentary.",
          },
        ],
        request.signal,
        resolved
      );
      provider = retry.provider;
      output = tryParse(retry.text, schema);
    }
  } catch {
    return Response.json({ error: "ai_unavailable" }, { status: 502 });
  }

  if (output === null) {
    return Response.json({ error: "generation_parse_failed" }, { status: 422 });
  }

  // 7. Persist to history (qa_artifacts — guests allowed by design)
  const { data: artifact } = await supabase
    .from("qa_artifacts")
    .insert({
      user_id: user.id,
      type: tool,
      input,
      output: JSON.stringify(output),
      ...(scopedProjectId ? { project_id: scopedProjectId } : {}),
    })
    .select("id, created_at")
    .single();

  return Response.json(
    { output, artifactId: artifact?.id ?? null },
    { headers: { "X-AI-Provider": provider } }
  );
}

function tryParse(
  text: string,
  schema: (typeof QA_OUTPUT_SCHEMAS)[keyof typeof QA_OUTPUT_SCHEMAS]
): unknown | null {
  try {
    const candidate = JSON.parse(extractJsonObject(text));
    const result = schema.safeParse(candidate);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
