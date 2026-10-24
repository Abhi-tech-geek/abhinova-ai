"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolForm } from "@/components/qa-studio/tool-form";
import { OutputPanel } from "@/components/qa-studio/output-panel";
import { HistoryTab } from "@/components/qa-studio/history-tab";
import { ProjectSelect } from "@/components/projects/project-select";
import { ModelPicker } from "@/components/code-studio/model-picker";
import type { QaToolDefinition } from "@/lib/qa-tools";
import type { QaArtifactRecord } from "@/types/qa";
import { showBetaLimitToast } from "@/lib/beta/client";

export function ToolWorkspace({
  tool,
  history,
}: {
  tool: QaToolDefinition;
  history: QaArtifactRecord[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<unknown>(null);
  const [projectId, setProjectId] = useState("");
  const [modelId, setModelId] = useState("");

  async function generate(input: string, options?: Record<string, string>) {
    setLoading(true);
    setOutput(null);
    try {
      const res = await fetch(`/api/qa/${tool.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          ...(options ? { options } : {}),
          ...(projectId ? { projectId } : {}),
          ...(modelId ? { modelId } : {}),
        }),
      });

      if (!res.ok) {
        if (await showBetaLimitToast(res)) return;
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.status === 429) {
          const data = await res.json().catch(() => ({ retryAfterMs: 60000 }));
          const seconds = Math.max(1, Math.ceil((data.retryAfterMs ?? 60000) / 1000));
          toast.warning("Rate limit reached", {
            description: `Try again in ${seconds}s.`,
          });
          return;
        }
        if (res.status === 422) {
          const data = await res.json().catch(() => null);
          if (data?.error === "refused") {
            toast.warning("Request not allowed", {
              description: data.message || "AbhiNova can't help with that request.",
            });
            return;
          }
          toast.error("The AI couldn't produce clean structured output", {
            description: "This is rare — hit Generate again, it retries fresh.",
          });
          return;
        }
        toast.error("Generation failed. Please try again.");
        return;
      }

      const data = await res.json();
      setOutput(data.output);
      router.refresh(); // pull the new artifact into the History tab
    } catch {
      toast.error("Connection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Tabs defaultValue="generate">
      <TabsList data-testid={`qastudio-${tool.id}-tabs`}>
        <TabsTrigger value="generate" data-testid={`qastudio-${tool.id}-tab-generate`}>
          Generate
        </TabsTrigger>
        <TabsTrigger value="history" data-testid={`qastudio-${tool.id}-tab-history`}>
          History ({history.length})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="generate" className="mt-4 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <ProjectSelect value={projectId} onChange={setProjectId} testID={`qastudio-${tool.id}-project`} />
          <ModelPicker value={modelId} onChange={setModelId} testID={`qastudio-${tool.id}-model`} />
        </div>
        <ToolForm tool={tool} loading={loading} onSubmit={generate} />
        {loading && (
          <div className="glass flex items-center gap-3 rounded-lg p-5">
            <span className="h-3 w-3 animate-pulse-glow rounded-full bg-primary" />
            <span className="text-xs text-muted-foreground">
              Generating structured output…
            </span>
          </div>
        )}
        {output !== null && <OutputPanel toolId={tool.id} data={output} />}
      </TabsContent>
      <TabsContent value="history" className="mt-4">
        <HistoryTab toolId={tool.id} artifacts={history} />
      </TabsContent>
    </Tabs>
  );
}
