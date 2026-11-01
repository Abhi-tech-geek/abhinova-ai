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
import { completeChat, completeVision, extractJsonObject, aiFailureResponse } from "@/lib/ai/router";
import { isLocalMode } from "@/lib/ai/ollama";
import type { VisionImage } from "@/lib/ai/gemini";
import { resolveModel } from "@/lib/models/byok";
import { QA_BASE_PROMPT, QA_TOOL_PROMPTS, QA_PROJECT_CONTEXT_NOTE, QA_SCREENSHOT_NOTE } from "@/lib/ai/prompts/qa-tools";
import { formatProjectInstructions } from "@/lib/ai/prompts/project-agent";
import { getOwnedProject } from "@/lib/projects/scope";
import { retrieveChunks, buildDocumentContext } from "@/lib/rag/retrieve";
import { createClient } from "@/lib/supabase/server";
import { enforceBetaQuota } from "@/lib/beta/quota";
import { splitRequirements, type Requirement } from "@/lib/qa-tools";
import type { AiMessage } from "@/types/chat";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ tool: string }> }
): Promise<Response> {
  const params = await ctx.params;
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
  const { input, projectId, modelId } = parsed.data;
  let options = parsed.data.options;
  const resolved = modelId ? await resolveModel(modelId) : null;
  if (modelId && !resolved) {
    return Response.json({ error: "unknown_model" }, { status: 400 });
  }

  // Bug Report from a screenshot: checked here, read by a vision model, never stored.
  let visionImage: VisionImage | null = null;
  if (parsed.data.image) {
    if (tool !== "bug-report") return Response.json({ error: "image_not_supported" }, { status: 400 });
    if (isLocalMode()) return Response.json({ error: "vision_not_local" }, { status: 400 });
    visionImage = parseScreenshot(parsed.data.image);
    if (!visionImage) return Response.json({ error: "invalid_image" }, { status: 400 });
  }

  // Requirements → Tests: the server numbers the requirements (R1, R2…) so
  // coverage can be computed in code, not trusted to the model.
  let requirements: Requirement[] = [];
  let modelInput = input;
  if (tool === "requirement-coverage") {
    requirements = splitRequirements(input);
    if (requirements.length === 0) return Response.json({ error: "no_requirements" }, { status: 400 });
    modelInput = requirements.map((r) => `${r.id}: ${r.text}`).join("\n");
    // "Write tests for the gaps": keep only well-formed, known ids.
    const known = new Set(requirements.map((r) => r.id));
    const onlyFor = (options?.onlyFor ?? "").split(",").map((s) => s.trim()).filter((id) => known.has(id));
    const startAt = /^\d{1,3}$/.test(options?.startAt ?? "") ? options!.startAt : undefined;
    options = onlyFor.length ? { onlyFor: onlyFor.join(", "), ...(startAt ? { startAt } : {}) } : undefined;
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
  const supabase = await createClient();
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
      content: `${QA_BASE_PROMPT}\n\n${QA_TOOL_PROMPTS[tool]}${scopedProjectId ? `\n\n${QA_PROJECT_CONTEXT_NOTE}` : ""}${visionImage ? `\n\n${QA_SCREENSHOT_NOTE}` : ""}`,
    },
    {
      role: "user",
      content: `${projectContext ? `${projectContext}\n\n` : ""}${optionsText ? `Options:\n${optionsText}\n\n` : ""}<user_input>\n${modelInput}\n</user_input>`,
    },
  ];

  // 5. Generate → parse → one corrective retry on failure
  const schema = QA_OUTPUT_SCHEMAS[tool];
  let provider: string;
  let output: unknown = null;

  // With a screenshot the vision model reads it; otherwise the normal chain.
  const call = (msgs: AiMessage[]) =>
    visionImage
      ? completeVision(msgs[0].content, msgs.slice(1).map((m) => m.content).join("\n\n"), visionImage, request.signal)
      : completeChat(msgs, request.signal, resolved, { json: true, maxTokens: QA_MAX_TOKENS });

  try {
    const first = await call(messages);
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
      const retry = await call([
        ...messages,
        { role: "assistant", content: first.text },
        {
          role: "user",
          content:
            "Your previous response was not valid JSON matching the required schema. Respond again with ONLY the corrected JSON object — no fences, no commentary.",
        },
      ]);
      provider = retry.provider;
      output = tryParse(retry.text, schema);
    }
  } catch (err) {
    return aiFailureResponse(err);
  }

  if (output === null) {
    return Response.json({ error: "generation_parse_failed" }, { status: 422 });
  }

  if (tool === "requirement-coverage") {
    // Keep only requirement ids that exist — a made-up "R99" never counts as coverage.
    const known = new Set(requirements.map((r) => r.id));
    const ai = output as { testCases: { covers: string[] }[] };
    output = {
      requirements,
      testCases: ai.testCases.map((tc) => ({
        ...tc,
        covers: [...new Set(tc.covers.map((c) => c.trim().toUpperCase()))].filter((c) => known.has(c)),
      })),
    };
  }

  // 7. Persist to history (qa_artifacts — guests allowed by design)
  const { data: artifact } = await supabase
    .from("qa_artifacts")
    .insert({
      user_id: user.id,
      type: tool,
      // The screenshot itself is never stored — history just notes it was there.
      input: visionImage ? `${input}\n\n[screenshot attached]` : input,
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

const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;
/** Long structured output (traced test suites, API suites) needs more than the chat default. */
const QA_MAX_TOKENS = 4096;

/** Data URL → image, only if the bytes really are a PNG / JPEG / WebP of that type. */
function parseScreenshot(dataUrl: string): VisionImage | null {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length < 16 || bytes.length > MAX_SCREENSHOT_BYTES) return null;
  const isPng = bytes[0] === 0x89 && bytes.subarray(1, 4).toString("latin1") === "PNG";
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP";
  const mime = match[1] as VisionImage["mimeType"];
  const ok = (mime === "image/png" && isPng) || (mime === "image/jpeg" && isJpeg) || (mime === "image/webp" && isWebp);
  return ok ? { mimeType: mime, base64: match[2] } : null;
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
