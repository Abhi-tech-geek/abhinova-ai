import {
  getAuthenticatedUser,
  UnauthorizedError,
  unauthorizedResponse,
  isGuest,
} from "@/lib/auth";
import { processRequestSchema } from "@/lib/validators/documents";
import { checkRateLimit } from "@/lib/rate-limit";
import { extractText } from "@/lib/rag/extract";
import { ingestBlocks } from "@/lib/rag/ingest";
import { createClient } from "@/lib/supabase/server";
import { isOpenBeta } from "@/lib/beta/config";

// Processing pipeline: download from storage → extract text (with provenance)
// → shared ingest (redact secrets → chunk → embed → store) → status 'ready'
// (or 'failed' with a friendly reason).
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }

  const body = await request.json().catch(() => null);
  const parsed = processRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const rl = await checkRateLimit(`process:${user.id}`, 10);
  if (!rl.allowed) {
    return Response.json(
      { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429 }
    );
  }

  const supabase = createClient();
  // RLS: only the owner's document resolves.
  const { data: document } = await supabase
    .from("documents")
    // "*" so this keeps working on a DB that hasn't run migration 002 yet.
    .select("*")
    .eq("id", parsed.data.documentId)
    .maybeSingle();
  if (!document) {
    return Response.json({ error: "document_not_found" }, { status: 404 });
  }
  // Guests may only process files inside a project (upload enforces the cap)
  // — except in the open beta, where Documents is open to guests too.
  if (isGuest(user) && !document.project_id && !isOpenBeta()) {
    return Response.json({ error: "guest_not_allowed" }, { status: 403 });
  }
  if (!document.storage_path) {
    return Response.json({ error: "not_a_file_document" }, { status: 400 });
  }

  async function fail(reason: string): Promise<Response> {
    await supabase
      .from("documents")
      .update({ status: "failed" })
      .eq("id", document!.id);
    return Response.json({ error: "processing_failed", reason }, { status: 422 });
  }

  try {
    const { data: blob, error: downloadError } = await supabase.storage
      .from("documents")
      .download(document.storage_path);
    if (downloadError || !blob) {
      return await fail("Could not read the uploaded file from storage.");
    }
    const buffer = Buffer.from(await blob.arrayBuffer());

    const blocks = await extractText(buffer, document.file_type, document.file_name);
    const result = await ingestBlocks(supabase, {
      userId: user.id,
      documentId: document.id,
      blocks,
    });

    await supabase
      .from("documents")
      .update({ status: "ready" })
      .eq("id", document.id);
    return Response.json({
      status: "ready",
      chunkCount: result.chunkCount,
      redactedSecrets: result.redactedSecrets,
      truncated: result.truncated,
    });
  } catch (err) {
    return await fail(
      err instanceof Error && err.message.includes("No readable text")
        ? "No readable text found in this file."
        : "Something went wrong while processing this file."
    );
  }
}
