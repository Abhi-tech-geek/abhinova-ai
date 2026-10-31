"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RecencyGroups, SidebarRow } from "@/components/workspace/session-list";
import type { ConversationRecord } from "@/types/chat";

// Main-chat history: grouped by recency, "⋯" menu with Rename / Delete.
export function ConversationList({
  conversations,
  filter = "",
}: {
  conversations: ConversationRecord[];
  filter?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [renameTarget, setRenameTarget] = useState<ConversationRecord | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ConversationRecord | null>(null);

  const visible = conversations.filter((c) =>
    c.title.toLowerCase().includes(filter.toLowerCase())
  );

  async function saveRename() {
    if (!renameTarget) return;
    const title = renameValue.trim().slice(0, 200);
    const id = renameTarget.id;
    setRenameTarget(null);
    if (!title || title === renameTarget.title) return;
    const res = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => null);
    if (!res?.ok) toast.error("Rename failed. Please try again.");
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    // Messages cascade-delete with the conversation (FK on delete cascade).
    const res = await fetch(`/api/conversations/${deleteTarget.id}`, { method: "DELETE" }).catch(() => null);
    const wasActive = pathname === `/chat/${deleteTarget.id}`;
    setDeleteTarget(null);
    if (!res?.ok) {
      toast.error("Delete failed. Please try again.");
      return;
    }
    if (wasActive) router.push("/chat");
    router.refresh();
  }

  if (visible.length === 0) {
    return (
      <p className="px-2.5 py-2 text-xs text-muted-foreground/60" data-testid="sidebar-conversations-empty">
        {filter ? "No matches." : "No chats yet — start one above."}
      </p>
    );
  }

  return (
    <>
      <RecencyGroups
        items={visible}
        getIso={(c) => c.updated_at}
        renderItem={(c) => (
          <SidebarRow
            key={c.id}
            href={`/chat/${c.id}`}
            title={c.title}
            active={pathname === `/chat/${c.id}`}
            testID="sidebar-conversation-item"
            actions={[
              {
                label: "Rename",
                testID: "sidebar-conversation-rename",
                onSelect: () => {
                  setRenameTarget(c);
                  setRenameValue(c.title);
                },
              },
              {
                label: "Delete",
                destructive: true,
                testID: "sidebar-conversation-delete",
                onSelect: () => setDeleteTarget(c),
              },
            ]}
          />
        )}
      />

      <Dialog open={renameTarget !== null} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="glass max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveRename();
            }}
          >
            <Input
              autoFocus
              value={renameValue}
              maxLength={200}
              onChange={(e) => setRenameValue(e.target.value)}
              data-testid="sidebar-conversation-rename-input"
            />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setRenameTarget(null)} data-testid="sidebar-rename-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={!renameValue.trim()} data-testid="sidebar-rename-save">
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="glass max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete chat?</DialogTitle>
            <DialogDescription>
              “{deleteTarget?.title}” and all its messages will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} data-testid="sidebar-delete-cancel">
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} data-testid="sidebar-delete-confirm">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
