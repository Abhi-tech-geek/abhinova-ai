"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { showBetaLimitToast } from "@/lib/beta/client";

// Fetches a cached AI insight (weekly mood / monthly themes) on demand.
export function InsightCard({
  title,
  endpoint,
  field,
  emptyHint,
  testID,
}: {
  title: string;
  endpoint: string; // GET route returning { [field]: string | null }
  field: "insight" | "themes";
  emptyHint: string;
  testID: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [noData, setNoData] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(endpoint);
      if (!res.ok) {
        if (await showBetaLimitToast(res)) return;
        toast.error(
          res.status === 429
            ? "Thoda ruk kar try karo — rate limit."
            : "Couldn't generate insights right now."
        );
        return;
      }
      const data = await res.json();
      if (!data[field]) {
        setNoData(true);
        return;
      }
      setText(data[field]);
    } catch {
      toast.error("Connection failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass rounded-2xl p-5" data-testid={testID}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">{title}</h2>
        {text === null && !noData && (
          <Button
            size="sm"
            variant="outline"
            onClick={load}
            disabled={loading}
            data-testid={`${testID}-load`}
          >
            {loading ? "Thinking…" : "✨ Show"}
          </Button>
        )}
      </div>
      {text && (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {text}
        </p>
      )}
      {noData && (
        <p className="mt-3 text-xs text-muted-foreground/70">{emptyHint}</p>
      )}
    </div>
  );
}
