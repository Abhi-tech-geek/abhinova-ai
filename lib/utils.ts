import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Relative time for session lists: "35m ago", "3h ago", "Yesterday", "12 Jun". */
export function timeAgo(iso: string): string {
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return "just now";
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = hours / 24;
  if (days < 2) return "Yesterday";
  if (days < 7) return `${Math.floor(days)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * Sidebar-style recency buckets (Today / Yesterday / Previous 7 days /
 * Previous 30 days / Older), by calendar day in the viewer's timezone.
 * Input order is preserved inside each bucket; empty buckets are dropped.
 */
export function groupByRecency<T>(
  items: T[],
  getIso: (item: T) => string,
  now: Date = new Date()
): { label: string; items: T[] }[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const DAY = 86_400_000;
  const buckets = [
    { label: "Today", from: startOfToday },
    { label: "Yesterday", from: startOfToday - DAY },
    { label: "Previous 7 days", from: startOfToday - 7 * DAY },
    { label: "Previous 30 days", from: startOfToday - 30 * DAY },
    { label: "Older", from: -Infinity },
  ].map((b) => ({ ...b, items: [] as T[] }));
  for (const item of items) {
    const t = new Date(getIso(item)).getTime();
    (buckets.find((b) => t >= b.from) ?? buckets[buckets.length - 1]).items.push(item);
  }
  return buckets.filter((b) => b.items.length > 0).map(({ label, items }) => ({ label, items }));
}

/**
 * Open-redirect guard for `?next=` params. Resolves against our own origin and
 * rejects anything that lands elsewhere (e.g. "//evil.com", "/\evil.com").
 */
export function safeNextPath(raw: string | null, origin: string, fallback = "/chat"): string {
  if (!raw) return fallback;
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin) return fallback;
    // Same-origin URLs can still carry "//evil.com" as the pathname, which a
    // browser treats as protocol-relative — collapse to a single leading slash.
    const path = `/${url.pathname.replace(/^[/\\]+/, "")}`;
    return path + url.search + url.hash;
  } catch {
    return fallback;
  }
}

/**
 * Human-readable citation location for a chunk — shared by the prompt builder
 * and the citation chips so both always agree: "p.3", "slide 2",
 * "Sheet: Q1, rows 12–40", "§ Scope", "src/app.ts", "PROJ-123".
 */
export function describeChunkLocation(meta: {
  page?: number;
  slide?: number;
  sheet?: string;
  rows?: string;
  heading?: string;
  path?: string;
  issueKey?: string;
}): string {
  if (meta.page !== undefined) return `p.${meta.page}`;
  if (meta.slide !== undefined) return `slide ${meta.slide}`;
  if (meta.sheet) return meta.rows ? `Sheet: ${meta.sheet}, rows ${meta.rows}` : `Sheet: ${meta.sheet}`;
  if (meta.rows) return `rows ${meta.rows}`;
  if (meta.issueKey) return meta.issueKey;
  if (meta.heading) return `§ ${meta.heading}`;
  if (meta.path) return meta.path;
  return "";
}

/**
 * Project chats prepend one metadata frame to the plain-text stream:
 *   "\u001eSOURCES <json>\n" then the reply text. The record-separator char
 * never appears in model text, so the client can split it off unambiguously.
 */
export const SOURCES_FRAME_PREFIX = "\u001eSOURCES ";
