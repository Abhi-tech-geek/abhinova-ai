"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TerminalOutput } from "@/components/code-studio/terminal-output";
import { isSandboxSupported, runInSandbox } from "@/lib/code/sandbox";
import { loadFilesForContext } from "@/lib/code/project-index";
import type { ProjectFileEntry } from "@/types/code";

// Runs JS/TS/Node in-browser via WebContainers — sandboxed & isolated, never
// on our server. Time + output limits enforced in lib/code/sandbox.
export function RunPanel({ files }: { files: ProjectFileEntry[] }) {
  const [command, setCommand] = useState("node index.js");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    if (running) return;
    if (!isSandboxSupported()) {
      toast.error("Sandbox unavailable", {
        description:
          "WebContainers need cross-origin isolation (Chromium browser + the /code-studio headers). Reload the page directly at /code-studio.",
      });
      return;
    }
    const [cmd, ...args] = command.trim().split(/\s+/);
    if (!cmd) return;
    setRunning(true);
    setOutput("");
    try {
      // Mount up to ~60k chars of project files (sandbox is per-tab).
      const mountFiles = await loadFilesForContext(files.slice(0, 200));
      const result = await runInSandbox(mountFiles, cmd, args, (chunk) =>
        setOutput((prev) => prev + chunk)
      );
      setOutput((prev) => prev + `\n[exit code: ${result.exitCode}]`);
    } catch {
      toast.error("Sandbox failed to boot or run.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex h-full flex-col" data-testid="codestudio-runpanel">
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5">
        <span className="text-[10px] text-muted-foreground">🔒 sandboxed in-browser</span>
        <Input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          className="h-7 flex-1 font-mono text-[11px]"
          placeholder="node index.js"
          data-testid="codestudio-run-command"
        />
        <Button size="sm" onClick={run} disabled={running} data-testid="codestudio-run-action">
          {running ? "Running…" : "▶ Run"}
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <TerminalOutput output={output} />
      </div>
    </div>
  );
}
