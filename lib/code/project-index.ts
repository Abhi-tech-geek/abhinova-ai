// Project file map + prompt-context helpers. Indexing runs in the browser
// (File System Access handles never leave it). Respects .gitignore AND the
// secret denylist — skipped files are reported to the user with reasons.

import { isSecretPath } from "@/lib/code/secret-scan";
import type { CodeFile, ProjectFileEntry, ProjectIndex, SkippedFile } from "@/types/code";

const MAX_FILE_BYTES = 400_000; // beyond this it's not useful LLM context
const MAX_FILES = 2_000;

const BINARY_EXTENSIONS =
  /\.(png|jpe?g|gif|webp|ico|svg|mp3|mp4|wav|ogg|woff2?|ttf|eot|zip|gz|tar|pdf|exe|dll|so|dylib|bin|lock)$/i;

// lib.dom doesn't ship the async-iteration members of the FS Access API yet.
interface DirectoryHandleWithEntries extends FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

/** Parses simple .gitignore lines into path predicates (no negation support). */
function parseGitignore(content: string): ((path: string) => boolean)[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"))
    .map((line) => {
      const clean = line.replace(/^\//, "").replace(/\/$/, "");
      const escaped = clean.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
      const re = new RegExp(`(^|/)${escaped}(/|$)`);
      return (path: string) => re.test(path);
    });
}

/** Walks the picked directory and builds the index (client-side only). */
export async function buildProjectIndex(
  root: FileSystemDirectoryHandle
): Promise<ProjectIndex> {
  const files: ProjectFileEntry[] = [];
  const skipped: SkippedFile[] = [];

  // Read root .gitignore first, if present.
  let ignoreRules: ((path: string) => boolean)[] = [];
  try {
    const gitignoreHandle = await root.getFileHandle(".gitignore");
    const text = await (await gitignoreHandle.getFile()).text();
    ignoreRules = parseGitignore(text);
  } catch {
    // no .gitignore — fine
  }

  async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    if (files.length >= MAX_FILES) return;
    for await (const [name, handle] of (dir as DirectoryHandleWithEntries).entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (isSecretPath(path)) {
        skipped.push({ path, reason: "secret denylist — never indexed or sent to any model" });
        continue;
      }
      if (ignoreRules.some((rule) => rule(path))) {
        skipped.push({ path, reason: ".gitignore" });
        continue;
      }
      if (handle.kind === "directory") {
        await walk(handle as FileSystemDirectoryHandle, path);
      } else {
        if (BINARY_EXTENSIONS.test(name)) continue; // silently skip binaries
        const file = await (handle as FileSystemFileHandle).getFile();
        if (file.size > MAX_FILE_BYTES) {
          skipped.push({ path, reason: "too large for AI context" });
          continue;
        }
        files.push({ path, size: file.size, handle: handle as FileSystemFileHandle });
      }
    }
  }

  await walk(root, "");
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, skipped };
}

// ---------------------------------------------------------------------------
// Code-aware retrieval: pick only the files relevant to the question, so we
// never ship the whole repo to the model.
// ---------------------------------------------------------------------------
const MAX_CONTEXT_CHARS = 60_000; // ~15k tokens of file context

export function selectRelevantFiles(
  files: ProjectFileEntry[],
  query: string,
  openFilePath: string | null
): ProjectFileEntry[] {
  const terms = Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9_$-]+/)
        .filter((t) => t.length > 2)
    )
  );

  const scored = files.map((file) => {
    const lowerPath = file.path.toLowerCase();
    let score = 0;
    if (openFilePath && file.path === openFilePath) score += 1000; // always in
    for (const term of terms) {
      if (lowerPath.includes(term)) score += 20;
    }
    if (/readme\.md$/i.test(file.path)) score += 5;
    if (/package\.json$/.test(file.path)) score += 4;
    return { file, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((s) => s.file);
}

/** Reads selected files up to the context budget. */
export async function loadFilesForContext(
  entries: ProjectFileEntry[]
): Promise<CodeFile[]> {
  const out: CodeFile[] = [];
  let used = 0;
  for (const entry of entries) {
    const content = await (await entry.handle.getFile()).text();
    if (used + content.length > MAX_CONTEXT_CHARS) continue;
    used += content.length;
    out.push({ path: entry.path, content });
  }
  return out;
}

/** Builds the <file> prompt block (used server-side by all api/code routes). */
export function buildFileContext(files: CodeFile[]): string {
  return files
    .map((f) => `<file path="${f.path}">\n${f.content}\n</file>`)
    .join("\n\n");
}
