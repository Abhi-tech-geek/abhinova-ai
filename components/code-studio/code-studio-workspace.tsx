"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectPicker } from "@/components/code-studio/project-picker";
import { FileTree } from "@/components/code-studio/file-tree";
import { CodeEditor } from "@/components/code-studio/code-editor";
import { DiffViewer } from "@/components/code-studio/diff-viewer";
import { RunPanel } from "@/components/code-studio/run-panel";
import { DocGenPanel } from "@/components/code-studio/doc-gen-panel";
import { ModelPicker } from "@/components/code-studio/model-picker";
import { ChatMessage } from "@/components/workspace/chat-message";
import {
  buildProjectIndex,
  selectRelevantFiles,
  loadFilesForContext,
} from "@/lib/code/project-index";
import { readFileText } from "@/lib/code/fs-access";
import { scanFile } from "@/lib/code/secret-scan";
import { CODE_ACTIONS } from "@/lib/validators/code";
import type {
  CodeFile,
  CodeEditOutput,
  ProjectIndex,
  ProjectFileEntry,
} from "@/types/code";
import { showBetaLimitToast } from "@/lib/beta/client";

interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const ACTION_LABELS: Record<string, string> = {
  chat: "💬 Ask",
  explain: "📖 Explain",
  fix: "🐛 Fix bugs",
  refactor: "♻️ Refactor",
  generate: "✨ Generate",
  tests: "🧪 Write tests",
};

export function CodeStudioWorkspace() {
  const rootRef = useRef<FileSystemDirectoryHandle | null>(null);
  const [index, setIndex] = useState<ProjectIndex | null>(null);
  const [openFile, setOpenFile] = useState<{ path: string; content: string } | null>(null);
  const [modelId, setModelId] = useState("");
  const [action, setAction] = useState<(typeof CODE_ACTIONS)[number]>("chat");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<{
    edit: CodeEditOutput;
    oldContents: Record<string, string>;
  } | null>(null);
  const [runOpen, setRunOpen] = useState(false);

  async function connectFolder(root: FileSystemDirectoryHandle) {
    rootRef.current = root;
    toast.info("Indexing project…");
    const built = await buildProjectIndex(root);
    setIndex(built);
    toast.success(
      `Indexed ${built.files.length} files${built.skipped.length ? ` · ${built.skipped.length} protected/skipped` : ""}`
    );
  }

  function connectPastedFile(path: string, content: string) {
    const scan = scanFile(path, content);
    if (scan.blocked) {
      toast.error("This file looks like it contains secrets", {
        description: scan.reason ?? undefined,
      });
      return;
    }
    setIndex({ files: [], skipped: [] });
    setOpenFile({ path, content });
  }

  async function openEntry(entry: ProjectFileEntry) {
    const content = await readFileText(entry.handle);
    const scan = scanFile(entry.path, content);
    if (scan.blocked) {
      toast.error(`${entry.path} is protected`, { description: scan.reason ?? undefined });
      return;
    }
    setOpenFile({ path: entry.path, content });
  }

  /** Gathers secret-scanned context: open file + code-aware relevant files. */
  async function gatherContext(query: string): Promise<CodeFile[]> {
    const out: CodeFile[] = [];
    if (openFile) out.push({ path: openFile.path, content: openFile.content });
    if (index && index.files.length > 0) {
      const relevant = selectRelevantFiles(index.files, query, openFile?.path ?? null).filter(
        (f) => f.path !== openFile?.path
      );
      out.push(...(await loadFilesForContext(relevant)));
    }
    return out.filter((f) => !scanFile(f.path, f.content).blocked).slice(0, 12);
  }

  async function send() {
    const message = input.trim();
    if (!message || streaming) return;
    setInput("");
    setStreaming(true);
    const userId = `u-${Date.now()}`;
    setMessages((prev) => [...prev, { id: userId, role: "user", content: message }]);
    const assistantId = `a-${Date.now()}`;

    try {
      const files = await gatherContext(message);
      const res = await fetch("/api/code/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          message,
          files,
          ...(modelId ? { modelId } : {}),
        }),
      });
      if (!res.ok) {
        setStreaming(false);
        // Not delivered: drop the bubble and give the words back to the box.
        setMessages((prev) => prev.filter((m) => m.id !== userId));
        setInput(message);
        if (await showBetaLimitToast(res)) return;
        toast.error(
          res.status === 429
            ? "Rate limit — try again shortly."
            : res.status === 400
              ? "Request blocked (possibly secret content detected)."
              : "Agent call failed."
        );
        return;
      }
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const delta = decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m))
        );
      }
    } catch {
      toast.error("Connection failed.");
    } finally {
      setStreaming(false);
    }
  }

  async function proposeEdit() {
    const instruction = input.trim();
    if (!instruction || streaming) return;
    if (!openFile) {
      toast.info("Open a file first — edits need at least one file.");
      return;
    }
    setStreaming(true);
    try {
      const files = await gatherContext(instruction);
      const res = await fetch("/api/code/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, files, ...(modelId ? { modelId } : {}) }),
      });
      if (!res.ok) {
        if (await showBetaLimitToast(res)) return;
        toast.error(res.status === 422 ? "The model couldn't produce a clean edit — try rephrasing." : "Edit request failed.");
        return;
      }
      const data = await res.json();
      const oldContents: Record<string, string> = {};
      for (const f of files) oldContents[f.path] = f.content;
      setPendingEdit({ edit: data.edit, oldContents });
      setInput("");
    } catch {
      toast.error("Connection failed.");
    } finally {
      setStreaming(false);
    }
  }

  function proposeDocWrite(path: string, content: string) {
    setPendingEdit({
      edit: {
        changes: [{ path, newContent: content, note: "Generated engineering doc" }],
        summary: "Write the generated document into the project (docs/).",
      },
      oldContents: {},
    });
  }

  if (!index) {
    return (
      <main className="flex min-h-full items-center justify-center p-8">
        <ProjectPicker onFolder={connectFolder} onPastedFile={connectPastedFile} />
      </main>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="codestudio-workspace">
      <div className="flex h-9 items-center justify-between border-b border-border/50 px-3">
        <span className="text-xs text-muted-foreground">
          {index.files.length > 0 ? `${index.files.length} files indexed` : "single-file mode"}
          {" · 🛡 secrets auto-blocked"}
        </span>
        <div className="flex items-center gap-2">
          <ModelPicker value={modelId} onChange={setModelId} />
          <Button size="sm" variant="ghost" onClick={() => setRunOpen((v) => !v)} data-testid="codestudio-run-toggle">
            {runOpen ? "Hide Run" : "▶ Run"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 border-r border-border/50">
          <FileTree
            files={index.files}
            skipped={index.skipped}
            openPath={openFile?.path ?? null}
            onOpen={openEntry}
          />
        </aside>

        <section className="min-w-0 flex-1 border-r border-border/50">
          {openFile ? (
            <CodeEditor
              path={openFile.path}
              content={openFile.content}
              onChange={(content) => setOpenFile({ ...openFile, content })}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Select a file from the tree
            </div>
          )}
        </section>

        <aside className="flex w-96 shrink-0 flex-col">
          <Tabs defaultValue="agent" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-3 mt-2">
              <TabsTrigger value="agent" data-testid="codestudio-tab-agent">Agent</TabsTrigger>
              <TabsTrigger value="docs" data-testid="codestudio-tab-docs">Docs</TabsTrigger>
            </TabsList>
            <TabsContent value="agent" className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-wrap gap-1 px-3 pt-2">
                {CODE_ACTIONS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAction(a)}
                    className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                      action === a
                        ? "border-primary/60 bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`codestudio-action-${a}`}
                  >
                    {ACTION_LABELS[a]}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {messages.length === 0 && (
                  <p className="pt-8 text-center text-xs text-muted-foreground">
                    Ask about the open file or the project — explain, fix,
                    refactor, generate, tests.
                  </p>
                )}
                {messages.map((m) => (
                  <ChatMessage
                    key={m.id}
                    role={m.role}
                    content={m.content}
                    streaming={streaming && m.id === messages[messages.length - 1]?.id && m.role === "assistant"}
                  />
                ))}
              </div>
              <div className="border-t border-border/50 p-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value.slice(0, 20000))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder="Ask the agent… (Enter to send)"
                  rows={2}
                  className="resize-none text-xs"
                  data-testid="codestudio-agent-input"
                />
                <div className="mt-1.5 flex justify-between">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={proposeEdit}
                    disabled={streaming || !input.trim()}
                    title="Ask for changes — you review diffs before anything is written"
                    data-testid="codestudio-propose-edit"
                  >
                    ✏️ Propose edit (diff)
                  </Button>
                  <Button
                    size="sm"
                    onClick={send}
                    disabled={streaming || !input.trim()}
                    data-testid="codestudio-agent-send"
                  >
                    {streaming ? "…" : "Send"}
                  </Button>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="docs" className="min-h-0 flex-1 overflow-y-auto">
              <DocGenPanel
                contextFiles={openFile ? [{ path: openFile.path, content: openFile.content }] : []}
                modelId={modelId}
                onProposeWrite={proposeDocWrite}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      {runOpen && (
        <div className="h-56 shrink-0 border-t border-border/50">
          <RunPanel files={index.files} />
        </div>
      )}

      {pendingEdit && (
        <div className="fixed inset-6 z-50">
          <DiffViewer
            edit={pendingEdit.edit}
            oldContents={pendingEdit.oldContents}
            root={rootRef.current}
            onApplied={(path, newContent) => {
              if (openFile?.path === path) setOpenFile({ path, content: newContent });
            }}
            onClose={() => setPendingEdit(null)}
          />
        </div>
      )}
    </div>
  );
}
