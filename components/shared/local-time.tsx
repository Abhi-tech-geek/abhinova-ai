"use client";

import { useMounted } from "@/hooks/use-mounted";
import { timeAgo } from "@/lib/utils";

const FORMATS: Record<"datetime" | "date" | "short", Intl.DateTimeFormatOptions> = {
  datetime: { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" },
  date: { day: "numeric", month: "short", year: "numeric" },
  short: { day: "numeric", month: "short" },
};

/**
 * A timestamp in the VIEWER's timezone + locale. Rendered only after mount so
 * server (UTC) and browser output can never mismatch during hydration.
 */
export function LocalTime({
  iso,
  format = "datetime",
  className,
}: {
  iso: string;
  /** "relative" = "5m ago" / "Yesterday" / "3 Oct". */
  format?: keyof typeof FORMATS | "relative";
  className?: string;
}) {
  const mounted = useMounted();
  const text = !mounted
    ? " "
    : format === "relative"
      ? timeAgo(iso)
      : new Date(iso).toLocaleString(undefined, FORMATS[format]);
  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  );
}
