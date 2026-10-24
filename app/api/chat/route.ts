import {
  getAuthenticatedUser,
  UnauthorizedError,
  unauthorizedResponse,
  isGuest,
} from "@/lib/auth";
import { chatRequestSchema } from "@/lib/validators/chat";
import {
  checkRateLimit,
  AI_REQUESTS_PER_MINUTE,
  GUEST_AI_REQUESTS_PER_MINUTE,
  GUEST_MAX_MESSAGES_PER_CONVERSATION,
} from "@/lib/rate-limit";
import { streamChat, fitToTokenBudget } from "@/lib/ai/router";
import { resolveModel } from "@/lib/models/byok";
import { WORKSPACE_SYSTEM_PROMPT, withScriptHint } from "@/lib/ai/prompts/workspace";
import { currentTimeNote } from "@/lib/ai/prompts/safety";
import { assembleProjectContext } from "@/lib/projects/context";
import { getOwnedProject } from "@/lib/projects/scope";
import { SOURCES_FRAME_PREFIX } from "@/lib/utils";
import { BETA_LIMITS, isOpenBeta } from "@/lib/beta/config";
import { enforceBetaQuota } from "@/lib/beta/quota";
import { createClient } from "@/lib/supabase/server";
import type { AiMessage, ChatRole } from "@/types/chat";
import type { RetrievedSource } from "@/types/documents";

const HISTORY_LIMIT = 20;

export async function POST(request: Request): Promise<Response> {
  // 1. Auth
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }

  // 2. Validate
  const body = await request.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const { message } = parsed.data;

  // 3. Rate limit (guests get half)
  const guest = isGuest(user);
  const rl = await checkRateLimit(
    `chat:${user.id}`,
    guest ? GUEST_AI_REQUESTS_PER_MINUTE : AI_REQUESTS_PER_MINUTE
  );
  if (!rl.allowed) {
    return Response.json(
      { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  const supabase = createClient();

  // 4. Resolve conversation (RLS guarantees ownership on every query below).
  // A conversation's project comes from the DB, never from the request.
  let conversationId = parsed.data.conversationId ?? null;
  let projectId: string | null = null;
  if (conversationId) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, project_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conversation) {
      return Response.json({ error: "conversation_not_found" }, { status: 404 });
    }
    projectId = (conversation.project_id as string | null) ?? null;
    if (guest) {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .eq("role", "user");
      const maxMessages = isOpenBeta() ? BETA_LIMITS.messagesPerChat : GUEST_MAX_MESSAGES_PER_CONVERSATION;
      if ((count ?? 0) >= maxMessages) {
        return Response.json(
          { error: "guest_conversation_limit" },
          { status: 403 }
        );
      }
    }
    const quotaBlocked = await enforceBetaQuota(user, request, ["ai"]);
    if (quotaBlocked) return quotaBlocked;
  } else {
    if (parsed.data.projectId) {
      const owned = await getOwnedProject(supabase, parsed.data.projectId);
      if (!owned) {
        return Response.json({ error: "project_not_found" }, { status: 404 });
      }
      projectId = owned.id;
    }
    // New chat: counts against the lifetime chat limit AND today's AI quota.
    const quotaBlocked = await enforceBetaQuota(user, request, ["ai", "chat"]);
    if (quotaBlocked) return quotaBlocked;
    const { data: conversation, error } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
        title: message.slice(0, 60),
        mode: "workspace",
        ...(projectId ? { project_id: projectId } : {}),
      })
      .select("id")
      .single();
    if (error || !conversation) {
      return Response.json({ error: "conversation_create_failed" }, { status: 500 });
    }
    conversationId = conversation.id;
  }
  if (!conversationId) {
    return Response.json({ error: "conversation_create_failed" }, { status: 500 });
  }

  // 5. Conversation memory: last N messages, oldest dropped by token budget
  const { data: historyRows } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const history: AiMessage[] = (historyRows ?? [])
    .reverse()
    .map((row) => ({ role: row.role as ChatRole, content: row.content }));

  // 6. Persist the user message before calling the model
  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: user.id,
    role: "user",
    content: message,
  });
  if (insertError) {
    return Response.json({ error: "message_save_failed" }, { status: 500 });
  }

  // Project chats: instructions → notes → project-scoped chunks.
  let systemPrompt = WORKSPACE_SYSTEM_PROMPT;
  let sources: RetrievedSource[] = [];
  if (projectId) {
    const project = await getOwnedProject(supabase, projectId);
    if (project) {
      const ctx = await assembleProjectContext(supabase, project, message, history.length === 0);
      systemPrompt = ctx.systemPrompt;
      sources = ctx.sources;
    }
  }

  const aiMessages = fitToTokenBudget([
    // Real IST clock so the model never invents the time (bug B6).
    { role: "system", content: `${systemPrompt}\n\n${currentTimeNote()}` },
    ...history,
    // Script hint goes to the model only — the stored message stays verbatim.
    { role: "user", content: withScriptHint(message) },
  ]);

  // 7. Stream. Explicit model (ModelPicker/BYOK) if given, else the default
  // Groq → Gemini fallback chain inside the router.
  const resolved = parsed.data.modelId
    ? await resolveModel(parsed.data.modelId)
    : null;
  if (parsed.data.modelId && !resolved) {
    return Response.json({ error: "unknown_model" }, { status: 400 });
  }
  let routed;
  try {
    routed = await streamChat(aiMessages, request.signal, resolved);
  } catch {
    return Response.json({ error: "ai_unavailable" }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const finalConversationId: string = conversationId;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = routed.textStream.getReader();
      let full = "";
      if (sources.length > 0) {
        controller.enqueue(encoder.encode(`${SOURCES_FRAME_PREFIX}${JSON.stringify(sources)}\n`));
      }
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          full += value;
          controller.enqueue(encoder.encode(value));
        }
      } catch {
        // Client aborted (stop button) — fall through and save the partial.
      }
      // 8. Persist assistant reply (partial too) BEFORE closing the response,
      // so serverless doesn't kill the write.
      if (full) {
        await supabase.from("messages").insert({
          conversation_id: finalConversationId,
          user_id: user.id,
          role: "assistant",
          content: full,
          // Citations survive a reload of the conversation.
          ...(sources.length > 0 ? { metadata: { sources } } : {}),
        });
        // Bump updated_at (trigger sets the timestamp) so sidebar reorders.
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", finalConversationId);
      }
      try {
        controller.close();
      } catch {
        // Already errored/cancelled.
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Conversation-Id": finalConversationId,
      "X-AI-Provider": routed.provider,
    },
  });
}
