"use client";

import { useEffect, useRef } from "react";

export function TerminalOutput({ output }: { output: string }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [output]);

  return (
    <pre
      ref={ref}
      className="h-full overflow-auto bg-background/80 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground"
      data-testid="codestudio-terminal"
    >
      {output || "— sandboxed terminal output appears here —"}
    </pre>
  );
}
