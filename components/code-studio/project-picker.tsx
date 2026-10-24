"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { isFsAccessSupported, pickDirectory } from "@/lib/code/fs-access";
import { useMounted } from "@/hooks/use-mounted";

export function ProjectPicker({
  onFolder,
  onPastedFile,
}: {
  onFolder: (root: FileSystemDirectoryHandle) => void;
  onPastedFile: (path: string, content: string) => void;
}) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteName, setPasteName] = useState("snippet.ts");
  const [pasteContent, setPasteContent] = useState("");
  // Phones and Safari/Firefox have no folder access — say so up front and
  // open the paste box instead of offering a button that can't work.
  const mounted = useMounted();
  const noFolderAccess = mounted && !isFsAccessSupported();
  const showPaste = pasteOpen || noFolderAccess;

  async function openFolder() {
    if (!isFsAccessSupported()) {
      toast.info("Folder access needs a Chromium browser", {
        description: "Chrome or Edge support the File System Access API. You can still paste a file below.",
      });
      return;
    }
    const root = await pickDirectory();
    if (root) onFolder(root);
  }

  return (
    <div className="glass mx-auto max-w-lg rounded-lg p-8 text-center" data-testid="codestudio-projectpicker">
      <h2 className="font-display text-xl font-semibold tracking-tight">
        Connect a project
      </h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Access stays in your browser — we never see your folder path. Secret
        files (.env, keys) are never indexed or sent to any model.
      </p>
      <div className="mt-6 flex flex-col items-center gap-2">
        <Button
          onClick={openFolder}
          disabled={noFolderAccess}
          className="shadow-glow-primary"
          data-testid="codestudio-open-folder"
        >
          📂 Open local folder
        </Button>
        {noFolderAccess && (
          <p className="text-[11px] text-muted-foreground" data-testid="codestudio-no-folder-access">
            This browser can&apos;t open folders (phones, Safari and Firefox). Use desktop
            Chrome or Edge for full projects — or paste a file below.
          </p>
        )}
        <Button
          variant="outline"
          disabled
          title="Coming soon — needs a GitHub OAuth app"
          data-testid="codestudio-github-connect"
        >
          GitHub repo (coming soon)
        </Button>
        {!noFolderAccess && (
          <button
            type="button"
            onClick={() => setPasteOpen((v) => !v)}
            className="mt-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            data-testid="codestudio-paste-toggle"
          >
            …or paste a single file for a quick task
          </button>
        )}
      </div>

      {showPaste && (
        <div className="mt-4 space-y-2 text-left">
          <Input
            value={pasteName}
            onChange={(e) => setPasteName(e.target.value)}
            placeholder="filename.ts"
            className="h-8 font-mono text-xs"
            data-testid="codestudio-paste-name"
          />
          <Textarea
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value.slice(0, 120000))}
            placeholder="Paste code here…"
            rows={8}
            className="font-mono text-xs"
            data-testid="codestudio-paste-content"
          />
          <Button
            size="sm"
            disabled={!pasteContent.trim() || !pasteName.trim()}
            onClick={() => onPastedFile(pasteName.trim(), pasteContent)}
            data-testid="codestudio-paste-submit"
          >
            Use this file
          </Button>
        </div>
      )}
    </div>
  );
}
