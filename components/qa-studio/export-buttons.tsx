"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadFile } from "@/lib/qa-tools";

// Export toolbar for QA outputs. Pass only the exports the tool supports.
export function ExportButtons({
  toolId,
  csv,
  markdown,
  json,
}: {
  toolId: string;
  csv?: () => string;
  markdown?: () => string;
  json?: () => string;
}) {
  async function copy(label: string, content: string) {
    await navigator.clipboard.writeText(content);
    toast.success(`${label} copied to clipboard`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {csv && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => downloadFile(`${toolId}.csv`, csv(), "text/csv")}
          data-testid={`qastudio-${toolId}-export-csv`}
        >
          ⬇ CSV
        </Button>
      )}
      {markdown && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => copy("Markdown", markdown())}
          data-testid={`qastudio-${toolId}-copy-markdown`}
        >
          Copy Markdown
        </Button>
      )}
      {json && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => copy("JSON", json())}
          data-testid={`qastudio-${toolId}-copy-json`}
        >
          Copy JSON
        </Button>
      )}
    </div>
  );
}
