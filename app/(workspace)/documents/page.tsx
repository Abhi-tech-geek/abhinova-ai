import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isGuest } from "@/lib/auth";
import { isOpenBeta } from "@/lib/beta/config";
import { LockedFeature } from "@/components/shared/locked-feature";
import { UploadDropzone } from "@/components/documents/upload-dropzone";
import { DocumentList } from "@/components/documents/document-list";
import { DocChat } from "@/components/documents/doc-chat";
import type { DocumentRecord } from "@/types/documents";

export default async function DocumentsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (isGuest(user) && !isOpenBeta()) {
    return (
      <LockedFeature
        feature="Document uploads"
        description="Uploaded documents are stored to your account so you can chat with them anytime."
        testID="documents-locked-panel"
      />
    );
  }

  const { data: documents } = await supabase
    .from("documents")
    .select("id, file_name, file_type, storage_path, status, created_at")
    .order("created_at", { ascending: false });

  const all = (documents ?? []) as DocumentRecord[];
  const ready = all.filter((d) => d.status === "ready");

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 sm:px-6 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-glow">
          Document <span className="text-primary">Intelligence</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload files, then ask questions with cited answers.
        </p>
      </header>

      <UploadDropzone />
      <DocumentList documents={all} />
      <DocChat documents={ready} />
    </main>
  );
}
