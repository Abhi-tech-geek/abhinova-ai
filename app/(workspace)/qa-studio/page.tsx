import { QA_TOOLS } from "@/lib/qa-tools";
import { ToolCard } from "@/components/qa-studio/tool-card";

export default function QaStudioPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-glow">
          QA <span className="text-primary">Studio</span>
        </h1>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          An AI copilot for software testers — built by a QA engineer, for QA
          engineers. Pick a tool.
        </p>
      </header>
      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="qastudio-tools-grid"
      >
        {QA_TOOLS.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </div>
    </main>
  );
}
