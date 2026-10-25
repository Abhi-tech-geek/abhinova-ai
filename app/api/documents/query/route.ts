import {
  getAuthenticatedUser,
  UnauthorizedError,
  unauthorizedResponse,
  isGuest,
} from "@/lib/auth";
import { documentQuerySchema } from "@/lib/validators/documents";
import { checkRateLimit, AI_REQUESTS_PER_MINUTE } from "@/lib/rate-limit";
import { completeChat, aiFailureResponse } from "@/lib/ai/router";
import { DOC_QA_SYSTEM_PROMPT } from "@/lib/ai/prompts/workspace";
import { retrieveChunks, firstChunks, buildDocumentContext } from "@/lib/rag/retrieve";
import type { RetrievedSource } from "@/types/documents";
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

  const userPrompt = `${buildDocumentContext(sources)}\n\nQuestion: ${question}`;

  try {
    const { provider, text } = await completeChat(
      [
        { role: "system", content: DOC_QA_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      request.signal
    );
    return Response.json(
      { answer: text, sources },
      { headers: { "X-AI-Provider": provider } }
    );
  } catch (err) {
    return aiFailureResponse(err);
  }
}
