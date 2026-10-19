import {
  getAuthenticatedUser,
  UnauthorizedError,
  unauthorizedResponse,
  isGuest,
} from "@/lib/auth";
import { codeChatRequestSchema } from "@/lib/validators/code";
import { checkRateLimit, AI_REQUESTS_PER_MINUTE } from "@/lib/rate-limit";
import { streamChat } from "@/lib/ai/router";
import { resolveModel } from "@/lib/models/byok";
import {
  CODE_AGENT_SYSTEM_PROMPT,
  CODE_ACTION_INSTRUCTIONS,
} from "@/lib/ai/prompts/code-agent";
import { scanFile } from "@/lib/code/secret-scan";
import { buildFileContext } from "@/lib/code/project-index";
import type { AiMessage } from "@/types/chat";
import { isOpenBeta } from "@/lib/beta/config";
import { enforceBetaQuota } from "@/lib/beta/quota";

export async function POST(request: Request): Promise<Response> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
  // Code Studio is blocked for guests (CLAUDE.md) — 403 server-side.
  if (isGuest(user) && !isOpenBeta()) {
    return Response.json({ error: "guest_not_allowed" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = codeChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const { action, message, files, modelId } = parsed.data;

  const rl = await checkRateLimit(`code:${user.id}`, AI_REQUESTS_PER_MINUTE);
  if (!rl.allowed) {
    return Response.json(
      { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429 }
    );
  }
  const quotaBlocked = await enforceBetaQuota(user, request, ["ai"]);
  if (quotaBlocked) return quotaBlocked;

  // Server-side secret scan — the client scans too, but never trust the client.
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

  const aiMessages: AiMessage[] = [
    { role: "system", content: `${CODE_AGENT_SYSTEM_PROMPT}\n\n${CODE_ACTION_INSTRUCTIONS[action]}` },
    {
      role: "user",
      content: `${files.length > 0 ? `${buildFileContext(files)}\n\n` : ""}${message}`,
    },
  ];

  let routed;
  try {
    routed = await streamChat(aiMessages, request.signal, resolved);
  } catch {
    return Response.json({ error: "ai_unavailable" }, { status: 502 });
  }

  // Plain streamed text — the agent never writes files; edits go via /edit.
  const encoder = new TextEncoder();
  const reader = routed.textStream.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(encoder.encode(value));
        }
      } catch {
        // client aborted
      }
      try {
        controller.close();
      } catch {}
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-AI-Provider": routed.provider,
    },
  });
}
