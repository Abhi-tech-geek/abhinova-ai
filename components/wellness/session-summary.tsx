"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function SessionSummary({
  summary,
  onClose,
}: {
  summary: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={summary !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="glass max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Today&apos;s session 🌿</DialogTitle>
          <DialogDescription className="text-xs">
            A little something to take with you.
          </DialogDescription>
        </DialogHeader>
        <p
          className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed"
          data-testid="wellness-session-summary"
        >
          {summary}
        </p>
      </DialogContent>
    </Dialog>
  );
}
