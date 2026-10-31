"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";

const CONFIRM_WORD = "DELETE";

/**
 * "Delete my data" button + a confirm dialog that only unlocks after typing
 * DELETE. Calls DELETE /api/account/data, then returns to a fresh chat.
 */
export function DeleteMyData() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const ready = typed.trim() === CONFIRM_WORD && !deleting;

  async function confirmDelete() {
    if (!ready) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/account/data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: CONFIRM_WORD }),
      });
      if (!res.ok) {
        toast.error(
          res.status === 429
            ? "Too many attempts — try again in a minute."
            : "Couldn't delete everything — some data may still be there. Please try again."
        );
        return;
      }
      setOpen(false);
      toast.success("All your data was deleted", {
        description: "Chats, files, projects, history and wellness entries are gone.",
      });
      router.push("/chat");
      router.refresh();
    } catch {
      toast.error("Connection problem — please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className="rounded-full border border-destructive/50 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          data-testid="privacy-delete-open"
        >
          🗑 Delete my data
        </button>
      </DialogPrimitive.Trigger>
      <DialogPortal>
        <DialogOverlay className="bg-background/70 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="glass fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[1.5rem] border border-border/70 p-6 shadow-glass duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          data-testid="privacy-delete-dialog"
        >
          <DialogPrimitive.Title className="font-display text-xl font-semibold tracking-tight">
            Delete all your data?
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
            This permanently removes your chats, uploaded files, projects and notes, QA and code
            history, wellness check-ins and journal, saved API keys, connected apps and any feedback
            you sent. It can&apos;t be undone.
          </DialogPrimitive.Description>
          <label htmlFor="privacy-delete-confirm" className="mt-5 block text-xs text-muted-foreground">
            Type <span className="font-mono font-semibold text-foreground">{CONFIRM_WORD}</span> to confirm
          </label>
          <input
            id="privacy-delete-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmDelete();
            }}
            autoComplete="off"
            className="mt-1.5 h-10 w-full rounded-xl border border-border/70 bg-background/50 px-3 font-mono text-sm outline-none focus:border-destructive/60 focus:ring-2 focus:ring-destructive/20"
            data-testid="privacy-delete-confirm"
          />
          <div className="mt-5 flex items-center justify-end gap-2">
            <DialogPrimitive.Close
              className="rounded-full border border-border/70 px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
              data-testid="privacy-delete-cancel"
            >
              Cancel
            </DialogPrimitive.Close>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={!ready}
              className="rounded-full bg-destructive px-5 py-2 text-sm font-semibold text-destructive-foreground transition-opacity disabled:pointer-events-none disabled:opacity-40"
              data-testid="privacy-delete-submit"
            >
              {deleting ? "Deleting…" : "Delete everything"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
