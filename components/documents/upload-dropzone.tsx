"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ALLOWED_FILE_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  getFileExtension,
} from "@/lib/validators/documents";
import { showBetaLimitToast } from "@/lib/beta/client";

type Phase = "idle" | "uploading" | "processing";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];

export function UploadDropzone({ projectId = null }: { projectId?: string | null } = {}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    // Client-side mirror of the server checks — fast feedback, not security.
    const ext = getFileExtension(file.name);
    if (IMAGE_EXTENSIONS.includes(ext)) {
      // OCR is intentionally not enabled (heavy on the free tier) — say so.
      toast.info("Images aren't indexed yet", {
        description: "Text in images needs OCR, which isn't enabled. Export it as PDF/text instead.",
      });
      return;
    }
    if (!(ALLOWED_FILE_EXTENSIONS as readonly string[]).includes(ext)) {
      toast.error("Unsupported file type", {
        description: `Allowed: ${ALLOWED_FILE_EXTENSIONS.join(", ")}`,
      });
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error("File too large", { description: "Maximum size is 10MB." });
      return;
    }

    setPhase("uploading");
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (projectId) formData.append("projectId", projectId);
      const uploadRes = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        if (await showBetaLimitToast(uploadRes)) return;
        const data = await uploadRes.json().catch(() => ({}));
        toast.error(
          data.error === "guest_limit_reached"
            ? "Guest limit: 2 files per project — create a free account for more."
            : uploadRes.status === 403
            ? "Guests can't upload documents — create a free account."
            : data.error === "content_type_mismatch"
            ? "That file's contents don't match its extension."
            : data.error === "unsupported_type"
              ? "Unsupported file type."
              : data.error === "file_too_large"
                ? "File too large (max 10MB)."
                : "Upload failed. Please try again."
        );
        return;
      }
      const { documentId } = await uploadRes.json();
      router.refresh(); // show the 'processing' row immediately

      setPhase("processing");
      const processRes = await fetch("/api/documents/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      if (!processRes.ok) {
        const data = await processRes.json().catch(() => ({}));
        toast.error("Processing failed", {
          description: data.reason ?? "Please try re-uploading the file.",
        });
      } else {
        const { chunkCount, redactedSecrets } = await processRes.json();
        toast.success("Document ready", {
          description: `Indexed into ${chunkCount} searchable chunks.${
            redactedSecrets ? ` ${redactedSecrets} credential-like value(s) were redacted.` : ""
          }`,
        });
      }
      router.refresh();
    } catch {
      toast.error("Connection failed during upload.");
    } finally {
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file && !busy) handleFile(file);
      }}
      onClick={() => !busy && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && !busy && inputRef.current?.click()}
      className={`glass flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "border-border/60"
      } ${busy ? "pointer-events-none opacity-70" : "hover:border-primary/50"}`}
      data-testid="documents-upload-dropzone"
    >
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_FILE_EXTENSIONS.map((e) => `.${e}`).join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
        data-testid="documents-upload-input"
      />
      {busy ? (
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 animate-pulse-glow rounded-full bg-primary" />
          <p className="text-sm text-muted-foreground">
            {phase === "uploading" ? "Uploading…" : "Extracting, chunking & embedding…"}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm font-medium">Drop a file here or click to browse</p>
          <p className="mt-1 text-xs text-muted-foreground">
            PDF, Word, PowerPoint, Excel, CSV, TXT, MD, JSON, code — up to 10MB
          </p>
        </>
      )}
    </div>
  );
}
