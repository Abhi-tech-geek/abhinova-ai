import {
  getAuthenticatedUser,
  UnauthorizedError,
  unauthorizedResponse,
  isGuest,
} from "@/lib/auth";
import { wellnessChatRequestSchema } from "@/lib/validators/wellness";
import {
  checkRateLimit,
  AI_REQUESTS_PER_MINUTE,
} from "@/lib/rate-limit";
import { streamChat, completeChat, fitToTokenBudget } from "@/lib/ai/router";
import {
  WELLNESS_SYSTEM_PROMPT,
  WELLNESS_FIRST_MESSAGE_INSTRUCTION,
  PERSONA_PROMPTS,
  SESSION_SUMMARY_PROMPT,
} from "@/lib/ai/prompts/wellness";
import { containsCrisisSignal, CRISIS_HELPLINES } from "@/lib/wellness/crisis";
import { createClient } from "@/lib/supabase/server";
import type { AiMessage, ChatRole } from "@/types/chat";
import { isOpenBeta } from "@/lib/beta/config";
import { enforceBetaQuota } from "@/lib/beta/quota";

const HISTORY_LIMIT = 20;
// The model's first line is a machine-read risk marker, stripped before the
// user sees anything. Only a boolean is ever stored — no analysis details.
const RISK_MARKER = /^\s*\[RISK:(OK|CRISIS)\]\s*/i;

export async function POST(request: Request): Promise<Response> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
  // Wellness needs a real account — guests see the locked state in the UI.
  if (isGuest(user) && !isOpenBeta()) {
    return Response.json({ error: "guest_not_allowed" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = wellnessChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const rl = await checkRateLimit(`wellness:${user.id}`, AI_REQUESTS_PER_MINUTE);
  if (!rl.allowed) {
    return Response.json(
      { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }
  // Beta quota: a new Talk session also uses one of the lifetime sessions.
  const isNewSession = parsed.data.action === "chat" && !parsed.data.conversationId;
  const quotaBlocked = await enforceBetaQuota(
    user,
    request,
    isNewSession ? ["ai", "wellness_session"] : ["ai"]
  );
  if (quotaBlocked) {
    // Safety first: a crisis message must ALWAYS reach the helplines, even when
    // the AI quota is used up — so it gets a fixed, non-AI reply + crisis card.
    if (parsed.data.action === "chat" && containsCrisisSignal(parsed.data.message)) {
      return crisisFallbackResponse();
    }
    return quotaBlocked;
  }

  const supabase = createClient();

  // ---------- End session → warm summary saved on the conversation ----------
  if (parsed.data.action === "end") {
    const { conversationId } = parsed.data;
    const { data: rows } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(40);
    if (!rows || rows.length === 0) {
      return Response.json({ error: "conversation_not_found" }, { status: 404 });
    }
    const transcript = rows
      .map((r) => `${r.role === "user" ? "User" : "Companion"}: ${r.content}`)
      .join("\n");
    try {
      const { text } = await completeChat([
        { role: "system", content: SESSION_SUMMARY_PROMPT },
        { role: "user", content: transcript.slice(0, 24000) },
      ]);
      await supabase
        .from("conversations")
        .update({ summary: text })
        .eq("id", conversationId);
      return Response.json({ summary: text });
    } catch {
      return Response.json({ error: "ai_unavailable" }, { status: 502 });
    }
  }

  // ---------- Chat turn ----------
  const { message, persona } = parsed.data;
  const keywordCrisis = containsCrisisSignal(message);

  let conversationId = parsed.data.conversationId ?? null;
  if (conversationId) {
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("mode", "wellness")
      .maybeSingle();
    if (!conversation) {
      return Response.json({ error: "conversation_not_found" }, { status: 404 });
    }
  } else {
    const { data: conversation, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, title: "Wellness session", mode: "wellness" })
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
  const finalConversationId: string = conversationId;

  const { data: historyRows } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", finalConversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const history: AiMessage[] = (historyRows ?? [])
    .reverse()
    .map((row) => ({ role: row.role as ChatRole, content: row.content }));
  const isFirstMessage = history.length === 0;

  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: finalConversationId,
    user_id: user.id,
    role: "user",
    content: message,
    crisis_flag: keywordCrisis,
  });
  if (insertError) {
    return Response.json({ error: "message_save_failed" }, { status: 500 });
  }

  const systemPrompt = [
    WELLNESS_SYSTEM_PROMPT,
    PERSONA_PROMPTS[persona],
    isFirstMessage ? WELLNESS_FIRST_MESSAGE_INSTRUCTION : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const aiMessages = fitToTokenBudget([
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: message },
  ]);

  let routed;
  try {
    routed = await streamChat(aiMessages, request.signal);
  } catch {
    return Response.json({ error: "ai_unavailable" }, { status: 502 });
  }

  // Buffer just enough of the stream to read + strip the risk marker, so the
  // crisis header is known before the Response is constructed.
  const reader = routed.textStream.getReader();
  let head = "";
  let headDone = false;
  while (head.length < 48 && !head.includes("]")) {
    const { done, value } = await reader.read();
    if (done) {
      headDone = true;
      break;
    }
    head += value;
  }
  const markerMatch = head.match(RISK_MARKER);
  const llmCrisis = markerMatch?.[1]?.toUpperCase() === "CRISIS";
  if (markerMatch) head = head.slice(markerMatch[0].length).replace(/^\s+/, "");
  const crisis = keywordCrisis || llmCrisis;

  if (crisis && !keywordCrisis) {
    // LLM caught what keywords missed — update the boolean only.
    await supabase
      .from("messages")
      .update({ crisis_flag: true })
      .eq("conversation_id", finalConversationId)
      .eq("role", "user")
      .eq("content", message);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = head;
      if (head) controller.enqueue(encoder.encode(head));
      if (!headDone) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            full += value;
            controller.enqueue(encoder.encode(value));
          }
        } catch {
          // Client aborted — keep the partial.
        }
      }
      if (full) {
        await supabase.from("messages").insert({
          conversation_id: finalConversationId,
          user_id: user.id,
          role: "assistant",
          content: full,
        });
        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", finalConversationId);
      }
      try {
        controller.close();
      } catch {
        // Already closed/cancelled.
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Conversation-Id": finalConversationId,
      "X-Crisis": crisis ? "1" : "0",
      "X-AI-Provider": routed.provider,
    },
  });
}

/** Non-AI crisis reply used when the AI can't run (e.g. beta quota used up). */
function crisisFallbackResponse(): Response {
  const lines = CRISIS_HELPLINES.map((h) => `• ${h.name}: ${h.number}`).join("\n");
  const text = `I'm really glad you told me. You don't have to go through this alone — please reach out to someone right now:\n${lines}\n\nAap akele nahi ho. Ek call kar lo — wahan log sunne ke liye hain, 24x7.`;
  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Crisis": "1", "Cache-Control": "no-store" },
  });
}
