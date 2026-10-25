"use client";

import { toast } from "sonner";
import { AI_BUSY_MESSAGE, AI_BUSY_TITLE, betaErrorMessage } from "@/lib/beta/config";

/**
 * If a failed API response is a beta-limit error — or "ai_busy", every AI
 * provider out of free quota — show the friendly toast and return true
 * (caller should stop). Reads a CLONE, so the caller can still read the body
 * for its own error handling when this returns false.
 */
export async function showBetaLimitToast(res: Response): Promise<boolean> {
  if (![403, 429, 503].includes(res.status)) return false;
  const data = await res.clone().json().catch(() => null);
  const code = (data as { error?: unknown } | null)?.error;
  if (code === "ai_busy") {
    toast.warning(AI_BUSY_TITLE, { description: AI_BUSY_MESSAGE, duration: 10000 });
    return true;
  }
  const message = betaErrorMessage(code);
  if (!message) return false;
  toast.warning("Beta limit", { description: message, duration: 8000 });
  return true;
}
