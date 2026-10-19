"use client";

import { toast } from "sonner";
import { betaErrorMessage } from "@/lib/beta/config";

/**
 * If a failed API response is a beta-limit error, show the friendly toast and
 * return true (caller should stop). Reads a CLONE, so the caller can still
 * read the body for its own error handling when this returns false.
 */
export async function showBetaLimitToast(res: Response): Promise<boolean> {
  if (![403, 429, 503].includes(res.status)) return false;
  const data = await res.clone().json().catch(() => null);
  const message = betaErrorMessage((data as { error?: unknown } | null)?.error);
  if (!message) return false;
  toast.warning("Beta limit", { description: message, duration: 8000 });
  return true;
}
