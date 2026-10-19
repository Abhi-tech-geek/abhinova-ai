"use client";

// File System Access API wrapper (Chromium). The user explicitly picks a
// directory and grants permission; access is scoped to that directory, never
// traverses above it, and is revocable. No server EVER sees the local path —
// all handles live and die in the browser tab.

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      mode?: "read" | "readwrite";
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

export function isFsAccessSupported(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

/** Opens the browser's directory picker (readwrite so approved diffs can save). */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFsAccessSupported()) return null;
  try {
    return await window.showDirectoryPicker!({ mode: "readwrite" });
  } catch {
    return null; // user cancelled the picker
  }
}

/** Resolves a relative path ("src/app.ts") to a file handle inside the root. */
export async function getFileHandle(
  root: FileSystemDirectoryHandle,
  path: string,
  create = false
): Promise<FileSystemFileHandle> {
  const parts = path.split("/").filter(Boolean);
  // Reject any traversal attempt — we never leave the picked directory.
  if (parts.some((p) => p === "." || p === "..")) {
    throw new Error(`Refusing path with traversal segments: ${path}`);
  }
  let dir = root;
  for (const part of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir.getFileHandle(parts[parts.length - 1], { create });
}

export async function readFileText(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile();
  return file.text();
}

/** Writes content to a path inside the picked directory (creates if needed). */
export async function writeFileText(
  root: FileSystemDirectoryHandle,
  path: string,
  content: string
): Promise<void> {
  const handle = await getFileHandle(root, path, true);
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}
