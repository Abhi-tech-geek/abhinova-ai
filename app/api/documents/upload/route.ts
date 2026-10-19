import { randomUUID } from "crypto";
import {
  getAuthenticatedUser,
  UnauthorizedError,
  unauthorizedResponse,
  isGuest,
} from "@/lib/auth";
import {
  ALLOWED_FILE_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  getFileExtension,
  sanitizeFileName,
  matchesMagicBytes,
  uploadProjectIdSchema,
} from "@/lib/validators/documents";
import { checkRateLimit } from "@/lib/rate-limit";
import { GUEST_MAX_DOCUMENTS } from "@/lib/projects/scope";
import { createClient } from "@/lib/supabase/server";
import { isOpenBeta } from "@/lib/beta/config";
import { enforceBetaQuota } from "@/lib/beta/quota";

// Upload: validate type AND extension server-side, 10MB max, sanitize name,
// store under {user_id}/{uuid}-{safe_name}, insert documents row 'processing'.
// NOTE: Vercel serverless caps request bodies at ~4.5MB — larger files need a
// direct-to-storage signed upload later. Fine for local/dev and small docs.
export async function POST(request: Request): Promise<Response> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return unauthorizedResponse();
    throw e;
  }
  const rl = await checkRateLimit(`upload:${user.id}`, 10);
  if (!rl.allowed) {
    return Response.json(
      { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429 }
    );
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "no_file" }, { status: 400 });
  }

  const projectIdParsed = uploadProjectIdSchema.safeParse(
    (formData?.get("projectId") as string | null) || null
  );
  if (!projectIdParsed.success) {
    return Response.json({ error: "invalid_project" }, { status: 400 });
  }
  const projectId = projectIdParsed.data;
  const supabase = createClient();

  if (projectId) {
    // RLS: only the owner's project resolves.
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) {
      return Response.json({ error: "project_not_found" }, { status: 404 });
    }
  }

  // Guests: at most GUEST_MAX_DOCUMENTS files (DB + storage policies enforce
  // the same). Outside the open beta they may only upload inside a project.
  if (isGuest(user)) {
    if (!projectId && !isOpenBeta()) {
      return Response.json({ error: "guest_not_allowed" }, { status: 403 });
    }
    const { count } = await supabase
      .from("documents")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) >= GUEST_MAX_DOCUMENTS) {
      return Response.json({ error: "guest_limit_reached" }, { status: 403 });
    }
  }

  // Server-side validation: extension allowlist + MIME allowlist + size.
  const ext = getFileExtension(file.name);
  if (!(ALLOWED_FILE_EXTENSIONS as readonly string[]).includes(ext)) {
    return Response.json(
      { error: "unsupported_type", allowed: ALLOWED_FILE_EXTENSIONS },
      { status: 400 }
    );
  }
  const allowedMimes = ALLOWED_MIME_TYPES[ext] ?? [];
  // Browsers send "application/octet-stream" when the OS has no MIME mapping
  // (common on Windows for .py/.java/.sql/.md) — treat it like "unknown".
  // The magic-bytes check below still verifies the actual content.
  const declaredMime = file.type === "application/octet-stream" ? "" : file.type;
  if (declaredMime && !allowedMimes.includes(declaredMime)) {
    return Response.json({ error: "mime_mismatch" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_FILE_SIZE_BYTES) {
    return Response.json(
      { error: "file_too_large", maxBytes: MAX_FILE_SIZE_BYTES },
      { status: 400 }
    );
  }

  const safeName = sanitizeFileName(file.name);
  const storagePath = `${user.id}/${randomUUID()}-${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  // Magic-byte check: actual content must match the claimed type.
  if (!matchesMagicBytes(ext, buffer)) {
    return Response.json({ error: "content_type_mismatch" }, { status: 400 });
  }
  // Beta: lifetime upload count (only valid files reach this point, and a
  // deleted document never gives the slot back).
  const quotaBlocked = await enforceBetaQuota(user, request, ["doc"]);
  if (quotaBlocked) return quotaBlocked;
  const { error: storageError } = await supabase.storage
    .from("documents")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (storageError) {
    return Response.json({ error: "storage_upload_failed" }, { status: 500 });
  }

  const { data: document, error: insertError } = await supabase
    .from("documents")
    .insert({
      user_id: user.id,
      file_name: safeName,
      file_type: ext,
      storage_path: storagePath,
      status: "processing",
      ...(projectId ? { project_id: projectId } : {}),
    })
    .select("id")
    .single();
  if (insertError || !document) {
    await supabase.storage.from("documents").remove([storagePath]);
    return Response.json({ error: "document_create_failed" }, { status: 500 });
  }

  return Response.json({ documentId: document.id });
}
