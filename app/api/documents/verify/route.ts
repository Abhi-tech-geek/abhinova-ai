import { getAuthenticatedUser, UnauthorizedError, unauthorizedResponse, isGuest } from "@/lib/auth";
import { sourceCheckRequestSchema, sourceCheckOutputSchema } from "@/lib/validators/documents";
import { checkRateLimit, AI_REQUESTS_PER_MINUTE } from "@/lib/rate-limit";
import { completeChat, extractJsonObject, aiFailureResponse } from "@/lib/ai/router";
import { SOURCE_CHECK_PROMPT } from "@/lib/ai/prompts/verify";
import { extractClaims, buildSourceCheckInput, type Claim } from "@/lib/rag/verify";
import { isLocalMode } from "@/lib/ai/ollama";
import { createClient } from "@/lib/supabase/server";
import { isOpenBeta } from "@/lib/beta/config";
import { enforceBetaQuota } from "@/lib/beta/quota";
import type { CitationCheck } from "@/types/documents";

// "Check sources": an AI judge reads every cited statement of a document
// answer next to the passages it cites. Passages are reloaded here by id
// (RLS → only the caller's chunks), never taken from the request body.
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

  const parsed = sourceCheckRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const claims = extractClaims(parsed.data.answer);
  if (claims.length === 0) return Response.json({ checks: [] });

  const rl = await checkRateLimit(`docs:${user.id}`, AI_REQUESTS_PER_MINUTE);
  if (!rl.allowed) {
    return Response.json(
      { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }
  const quotaBlocked = await enforceBetaQuota(user, request, ["ai"]);
  if (quotaBlocked) return quotaBlocked;

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("document_chunks")
    .select("id, content")
    .in("id", parsed.data.sources.map((s) => s.id));
  const contentById = new Map((rows ?? []).map((r) => [r.id as string, r.content as string]));
  const passages = new Map<string, string>();
  for (const s of parsed.data.sources) {
    const content = contentById.get(s.id);
    if (content) passages.set(s.tag, content);
  }

  // A statement whose every tag is unknown can't be checked: it cites nothing real.
  const checkable = claims.filter((c) => c.tags.some((t) => passages.has(t)));
  // Cloud models judge every statement in one call. The small local model
  // mixes statements up when given several, so it gets one per call.
  const batches = isLocalMode() ? checkable.map((c) => [c]) : [checkable];
  const verdicts = new Map<Claim, { status: CitationCheck["status"]; note?: string }>();
  try {
    for (const batch of batches) {
      const { text } = await completeChat(
        [
          { role: "system", content: SOURCE_CHECK_PROMPT },
          { role: "user", content: buildSourceCheckInput(batch, passages) },
        ],
        request.signal,
        null,
        { json: true }
      );
      let parsedOut: unknown = null;
      try {
        parsedOut = JSON.parse(extractJsonObject(text));
      } catch {
        // unreadable reply → these statements stay "unchecked"
      }
      const out = sourceCheckOutputSchema.safeParse(parsedOut);
      if (!out.success) continue;
      for (const r of out.data.results) {
        const claim = batch[r.n - 1];
        if (claim) verdicts.set(claim, { status: r.verdict, note: r.note });
      }
    }
  } catch (err) {
    return aiFailureResponse(err);
  }
  if (checkable.length > 0 && verdicts.size === 0) {
    return Response.json({ error: "check_failed" }, { status: 502 });
  }

  const checks: CitationCheck[] = claims.map((c) => {
    if (!checkable.includes(c)) return { claim: c.claim, tags: c.tags, status: "missing" };
    const v = verdicts.get(c);
    // The judge skipped it: say so honestly instead of guessing a verdict.
    return v
      ? { claim: c.claim, tags: c.tags, status: v.status, ...(v.note ? { note: v.note } : {}) }
      : { claim: c.claim, tags: c.tags, status: "unchecked" };
  });
  return Response.json({ checks });
}
