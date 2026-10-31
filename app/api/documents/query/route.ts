import {
  getAuthenticatedUser,
  UnauthorizedError,
  unauthorizedResponse,
  isGuest,
} from "@/lib/auth";
import { documentQuerySchema } from "@/lib/validators/documents";
import { checkRateLimit, AI_REQUESTS_PER_MINUTE } from "@/lib/rate-limit";
import { completeChat, aiFailureResponse } from "@/lib/ai/router";
import { DOC_QA_SYSTEM_PROMPT, withScriptHint } from "@/lib/ai/prompts/workspace";
import { retrieveChunks, firstChunks, buildDocumentContext } from "@/lib/rag/retrieve";
import { activeEmbeddingModel } from "@/lib/ai/embeddings";
import { createClient } from "@/lib/supabase/server";
import type { AnswerTrace, RetrievedSource } from "@/types/documents";
import { isOpenBeta } from "@/lib/beta/config";
import { enforceBetaQuota } from "@/lib/beta/quota";

// Chat-with-documents. Returns { answer, sources } — the answer cites [S1]…
// tags that map to the sources array; the UI renders them as citation chips.
export async function POST(request: Request): Promise<Response> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }

  // Documents are account-only — guests get 403 here too, not just in the UI.
  if (isGuest(user) && !isOpenBeta()) {
    return Response.json({ error: "guest_not_allowed" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = documentQuerySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }
  const { question, documentIds, mode } = parsed.data;

  const rl = await checkRateLimit(`docs:${user.id}`, AI_REQUESTS_PER_MINUTE);
  if (!rl.allowed) {
    return Response.json(
      { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }
  const quotaBlocked = await enforceBetaQuota(user, request, ["ai"]);
  if (quotaBlocked) return quotaBlocked;

  // Retrieval — RLS inside the RPC guarantees only this user's chunks.
  const startedAt = Date.now();
  let sources: RetrievedSource[];
  try {
    sources =
      mode === "summarize"
        ? await firstChunks(documentIds[0])
        : await retrieveChunks(question, documentIds);
  } catch {
    return Response.json({ error: "retrieval_failed" }, { status: 502 });
  }

  if (sources.length === 0) {
    return Response.json({
      answer:
        "I couldn't find any relevant content in the selected documents for that question.",
      sources: [],
    });
  }

  // Script hint, as in chat: a Roman-letter Hinglish question must not get a
  // Devanagari answer (the hint is skipped for other scripts).
  const userPrompt = `${buildDocumentContext(sources)}\n\nQuestion: ${withScriptHint(question)}`;
  const searchMs = Date.now() - startedAt;

  try {
    const answerStartedAt = Date.now();
    const { provider, text } = await completeChat(
      [
        { role: "system", content: DOC_QA_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      request.signal
    );
    const similarities = sources.map((s) => s.similarity).filter((s): s is number => s !== null);
    const trace: AnswerTrace = {
      mode,
      documents: await documentStats(documentIds),
      embedModel: activeEmbeddingModel(),
      passagesUsed: sources.length,
      topSimilarity: similarities.length > 0 ? Math.max(...similarities) : null,
      contextChars: userPrompt.length,
      answerProvider: provider,
      timingsMs: { search: searchMs, answer: Date.now() - answerStartedAt },
    };
    return Response.json(
      { answer: text, sources, trace },
      { headers: { "X-AI-Provider": provider } }
    );
  } catch (err) {
    return aiFailureResponse(err);
  }
}

/** File names + passage counts for the "How this answer was made" view (RLS-scoped). */
async function documentStats(documentIds: string[]): Promise<AnswerTrace["documents"]> {
  const supabase = await createClient();
  const { data: docs } = await supabase.from("documents").select("id, file_name").in("id", documentIds);
  return Promise.all(
    (docs ?? []).map(async (d) => {
      const { count } = await supabase
        .from("document_chunks")
        .select("id", { count: "exact", head: true })
        .eq("document_id", d.id);
      return { fileName: d.file_name as string, chunks: count ?? 0 };
    })
  );
}
