"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

export const OPEN_PALETTE_EVENT = "anv:open-command-palette";

/** Open the Cmd+K palette from anywhere (e.g. a button). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

// cmdk + the dialog only download the first time the palette opens.
const CommandPaletteDialog = dynamic(() => import("@/components/shared/command-palette-dialog"), {
  ssr: false,
});

// Cmd/Ctrl+K launcher: navigate anywhere, jump to a project, switch theme,
// toggle Wellness Mode. This part only listens; the palette itself is lazy.
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setRequested(true);
        setOpen((prev) => !prev);
      }
    }
    // The sidebar's "Search" item opens the palette without a keyboard.
    const onOpenRequest = () => {
      setRequested(true);
      setOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpenRequest);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpenRequest);
    };
  }, []);

  if (!requested) return null;
  return <CommandPaletteDialog open={open} onOpenChange={setOpen} />;
}
