import {
  getAuthenticatedUser,
  UnauthorizedError,
  unauthorizedResponse,
  isGuest,
} from "@/lib/auth";
import { codeEditRequestSchema, codeEditOutputSchema } from "@/lib/validators/code";
import { checkRateLimit, AI_REQUESTS_PER_MINUTE } from "@/lib/rate-limit";
import { completeChat, extractJsonObject, aiFailureResponse } from "@/lib/ai/router";
import { resolveModel } from "@/lib/models/byok";
import { CODE_EDIT_SYSTEM_PROMPT } from "@/lib/ai/prompts/code-agent";
import { scanFile, isSecretPath } from "@/lib/code/secret-scan";
import { buildFileContext } from "@/lib/code/project-index";
import type { AiMessage } from "@/types/chat";
import { isOpenBeta } from "@/lib/beta/config";
import { enforceBetaQuota } from "@/lib/beta/quota";

// Produces proposed changes as full new file contents. NEVER writes anything —
// the client shows diffs, the user approves each one, and only then the
// File System Access handle writes locally (lib/code/diff.ts).
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
  const parsed = codeEditRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const { instruction, files, modelId } = parsed.data;

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
    { role: "system", content: CODE_EDIT_SYSTEM_PROMPT },
    { role: "user", content: `${buildFileContext(files)}\n\nInstruction: ${instruction}` },
  ];

  try {
    const first = await completeChat(messages, request.signal, resolved, { json: true });
    let output = tryParse(first.text);
    if (output === null) {
      const retry = await completeChat(
        [
          ...messages,
          { role: "assistant", content: first.text },
          {
            role: "user",
            content:
              "Your previous response was not valid JSON matching the schema. Respond with ONLY the corrected JSON object.",
          },
        ],
        request.signal,
        resolved,
        { json: true }
      );
      output = tryParse(retry.text);
    }
    if (output === null) {
      return Response.json({ error: "generation_parse_failed" }, { status: 422 });
    }
    // Model must never propose changes to secret paths.
    output.changes = output.changes.filter((c) => !isSecretPath(c.path));
    if (output.changes.length === 0) {
      return Response.json({ error: "no_valid_changes" }, { status: 422 });
    }
    return Response.json({ edit: output });
  } catch (err) {
    return aiFailureResponse(err);
  }
}

function tryParse(text: string) {
  try {
    const candidate = JSON.parse(extractJsonObject(text));
    const result = codeEditOutputSchema.safeParse(candidate);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
