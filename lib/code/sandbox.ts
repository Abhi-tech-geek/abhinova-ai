"use client";

// WebContainers run wrapper — code executes IN-BROWSER, fully isolated,
// never on our server (CLAUDE.md Code Studio rules). Time + output limits
// enforced. Heavier languages/runs would need a remote isolated sandbox
// (e.g. E2B) later — that's the clean extension point, not built now.

import type { WebContainer } from "@webcontainer/api";
import type { CodeFile } from "@/types/code";

const RUN_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 100_000;

let containerPromise: Promise<WebContainer> | null = null;

/** Boots once per tab. Requires COOP/COEP headers (set in next.config.mjs). */
async function getContainer(): Promise<WebContainer> {
  if (!containerPromise) {
    containerPromise = import("@webcontainer/api").then(({ WebContainer }) =>
      WebContainer.boot()
    );
  }
  return containerPromise;
}

export function isSandboxSupported(): boolean {
  return typeof window !== "undefined" && window.crossOriginIsolated === true;
}

type FileSystemTree = Parameters<WebContainer["mount"]>[0];

function toMountTree(files: CodeFile[]): FileSystemTree {
  const tree: FileSystemTree = {};
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recursive tree building
    let node: any = tree;
    for (const part of parts.slice(0, -1)) {
      node[part] = node[part] ?? { directory: {} };
      node = node[part].directory;
    }
    node[parts[parts.length - 1]] = { file: { contents: file.content } };
  }
  return tree;
}

export interface RunResult {
  exitCode: number | null;
  timedOut: boolean;
}

/**
 * Mounts the files and runs a command (e.g. "node index.js" or
 * "npm install && npm start" split by the caller), streaming output.
 */
export async function runInSandbox(
  files: CodeFile[],
  command: string,
  args: string[],
  onOutput: (chunk: string) => void
): Promise<RunResult> {
  const container = await getContainer();
  await container.mount(toMountTree(files));

  const process = await container.spawn(command, args);
  let outputChars = 0;
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    void process.kill();
  }, RUN_TIMEOUT_MS);

  void process.output.pipeTo(
    new WritableStream<string>({
      write(chunk) {
        outputChars += chunk.length;
        if (outputChars > MAX_OUTPUT_CHARS) {
          onOutput("\n[output limit reached — process killed]\n");
          void process.kill();
          return;
        }
        onOutput(chunk);
      },
    })
  );

  const exitCode = await process.exit;
  clearTimeout(timeout);
  if (timedOut) onOutput(`\n[timed out after ${RUN_TIMEOUT_MS / 1000}s — process killed]\n`);
  return { exitCode, timedOut };
}
