"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ExportMessage {
  role: string;
  content: string;
}

function toMarkdown(title: string, messages: ExportMessage[]): string {
  const body = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `### ${m.role === "user" ? "You" : "AbhiNova"}\n\n${m.content.trim()}`)
    .join("\n\n---\n\n");
  return `# ${title}\n\n_Exported from AbhiNova AI · ${new Date().toLocaleString()}_\n\n${body}\n`;
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "abhinova-chat";
}

/**
 * Chat toolbar: Export (copy / download Markdown / print-to-PDF) and Share
 * (public read-only link, see migration 006 and /share/[shareId]).
 */
export function ChatActions({
  conversationId,
  messages,
}: {
  conversationId: string;
  messages: ExportMessage[];
}) {
  const title = (messages.find((m) => m.role === "user")?.content ?? "AbhiNova chat").slice(0, 80).trim();
  const [shareOpen, setShareOpen] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shareUrl = shareId && typeof window !== "undefined" ? `${window.location.origin}/share/${shareId}` : "";

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(toMarkdown(title, messages));
      toast.success("Chat copied as Markdown");
    } catch {
      toast.error("Couldn't copy — try Download instead.");
    }
  }

  function downloadMarkdown() {
    const url = URL.createObjectURL(new Blob([toMarkdown(title, messages)], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(title)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // A plain printable page in a new tab. Built with DOM nodes + textContent,
  // so chat text can never be interpreted as HTML.
  function printPdf() {
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Allow pop-ups to print this chat.");
      return;
    }
    const doc = w.document;
    doc.title = title;
    const style = doc.createElement("style");
    style.textContent =
      "body{font-family:system-ui,sans-serif;max-width:720px;margin:32px auto;padding:0 16px;color:#111;line-height:1.55}h1{font-size:22px}h3{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#555;margin:22px 0 6px}.msg{white-space:pre-wrap;font-size:14px}.meta{color:#777;font-size:12px}";
    doc.head.appendChild(style);
    const add = (tag: string, text: string, className?: string) => {
      const el = doc.createElement(tag);
      el.textContent = text;
      if (className) el.className = className;
      doc.body.appendChild(el);
    };
    add("h1", title);
    add("p", "Exported from AbhiNova AI", "meta");
    for (const m of messages) {
      if (m.role !== "user" && m.role !== "assistant") continue;
      add("h3", m.role === "user" ? "You" : "AbhiNova");
      add("div", m.content.trim(), "msg");
    }
    w.focus();
    w.print();
  }

  async function shareRequest(method: "GET" | "POST" | "DELETE") {
    const res = await fetch(`/api/conversations/${conversationId}/share`, { method });
    const data = await res.json().catch(() => ({}));
    if (data.error === "sharing_not_set_up") {
      toast.error("Sharing isn't set up on this server yet", { description: "The owner needs to run database migration 006." });
      return null;
    }
    if (!res.ok) {
      toast.error(data.error === "cannot_share" ? "This chat can't be shared." : "Sharing failed — please try again.");
      return null;
    }
    return data as { shareId?: string | null; shared?: boolean };
  }

  async function openShare() {
    setShareOpen(true);
    setBusy(true);
    const data = await shareRequest("GET");
    setShareId(data?.shareId ?? null);
    setBusy(false);
  }

  async function createLink() {
    setBusy(true);
    const data = await shareRequest("POST");
    if (data?.shareId) {
      setShareId(data.shareId);
      try {
        await navigator.clipboard.writeText(`${window.location.origin}/share/${data.shareId}`);
        toast.success("Link created and copied");
      } catch {
        toast.success("Link created");
      }
    }
    setBusy(false);
  }

  async function stopSharing() {
    setBusy(true);
    const data = await shareRequest("DELETE");
    if (data) {
      setShareId(null);
      toast.success("Sharing stopped — the link no longer works");
    }
    setBusy(false);
  }

  const button =
    "rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground";

  return (
    <div className="flex items-center justify-end gap-2" data-testid="chat-actions">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={button} data-testid="chat-export-menu">
            ⬇ Export
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={copyMarkdown} data-testid="chat-export-copy">📋 Copy as Markdown</DropdownMenuItem>
          <DropdownMenuItem onSelect={downloadMarkdown} data-testid="chat-export-download">📄 Download .md</DropdownMenuItem>
          <DropdownMenuItem onSelect={printPdf} data-testid="chat-export-pdf">🖨 Print / Save as PDF</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button type="button" onClick={openShare} className={button} data-testid="chat-share-open">
        🔗 Share
      </button>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogPortal>
          <DialogOverlay className="bg-background/70 backdrop-blur-sm" />
          <DialogPrimitive.Content
            className="glass fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[1.5rem] border border-border/70 p-6 shadow-glass"
            data-testid="chat-share-dialog"
          >
            <DialogPrimitive.Title className="font-display text-xl font-semibold tracking-tight">Share this chat</DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
              Anyone with the link can read this chat — no login needed. New messages show up too, until you stop sharing.
            </DialogPrimitive.Description>
            {shareId ? (
              <div className="mt-5 space-y-3">
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-10 min-w-0 flex-1 rounded-xl border border-border/70 bg-background/50 px-3 font-mono text-xs"
                    data-testid="chat-share-url"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(shareUrl);
                        toast.success("Link copied");
                      } catch {
                        toast.error("Select the link and copy it.");
                      }
                    }}
                    className="brand-gradient shrink-0 rounded-full px-4 text-sm font-semibold text-white"
                    data-testid="chat-share-copy"
                  >
                    Copy
                  </button>
                </div>
                <button
                  type="button"
                  onClick={stopSharing}
                  disabled={busy}
                  className="text-xs font-medium text-destructive underline-offset-4 hover:underline disabled:opacity-50"
                  data-testid="chat-share-stop"
                >
                  Stop sharing
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={createLink}
                disabled={busy}
                className="brand-gradient mt-5 rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                data-testid="chat-share-create"
              >
                {busy ? "…" : "Create link"}
              </button>
            )}
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
