import Link from "next/link";
import type { QaToolDefinition } from "@/lib/qa-tools";

export function ToolCard({ tool }: { tool: QaToolDefinition }) {
  return (
    <Link
      href={`/qa-studio/${tool.id}`}
      className="glass hover-lift group block rounded-lg p-5 hover:border-primary/50 hover:shadow-glow-primary"
      data-testid={`qastudio-toolcard-${tool.id}`}
    >
      <span className="text-2xl">{tool.icon}</span>
      <h3 className="mt-3 font-display text-sm font-semibold tracking-tight group-hover:text-primary">
        {tool.name}
      </h3>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        {tool.description}
      </p>
    </Link>
  );
}
