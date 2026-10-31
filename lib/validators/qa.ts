import { z } from "zod";

// All QA Studio zod schemas live here — never inline in routes (see CLAUDE.md).
// Every tool's AI output MUST parse against its schema below (safe fallback +
// one retry handled in app/api/qa/[tool]/route.ts).

export const QA_TOOL_IDS = [
  "test-cases",
  "bug-report",
  "edge-cases",
  "api-tests",
  "regression-checklist",
  "sql-tests",
  "test-data",
  "automation-snippet",
] as const;

export const qaToolIdSchema = z.enum(QA_TOOL_IDS);
export type QaToolId = z.infer<typeof qaToolIdSchema>;

/** A saved QA run (DELETE /api/qa/artifacts/[id]). */
export const qaArtifactIdSchema = z.string().uuid();

export const qaRequestSchema = z.object({
  input: z.string().min(1).max(20000),
  options: z.record(z.string(), z.string().max(100)).optional(),
  /** Optional project: its instructions + relevant chunks join the prompt. */
  projectId: z.string().uuid().optional(),
  /** ModelPicker choice; omitted = default Groq → Gemini chain. */
  modelId: z.string().min(3).max(200).optional(),
});
export type QaRequest = z.infer<typeof qaRequestSchema>;

// ---------------------------------------------------------------------------
// Output schemas (one per tool)
// ---------------------------------------------------------------------------

export const testCasesOutputSchema = z.object({
  testCases: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        preconditions: z.string(),
        steps: z.array(z.string()).min(1),
        expectedResult: z.string(),
        priority: z.enum(["High", "Medium", "Low"]),
        type: z.enum(["positive", "negative", "edge"]),
      })
    )
    .min(1),
});
export type TestCasesOutput = z.infer<typeof testCasesOutputSchema>;

export const bugReportOutputSchema = z.object({
  title: z.string(),
  environment: z.string(),
  stepsToReproduce: z.array(z.string()).min(1),
  expectedResult: z.string(),
  actualResult: z.string(),
  severity: z.enum(["Critical", "Major", "Minor", "Trivial"]),
  priority: z.enum(["High", "Medium", "Low"]),
  attachmentsChecklist: z.array(z.string()),
});
export type BugReportOutput = z.infer<typeof bugReportOutputSchema>;

export const edgeCasesOutputSchema = z.object({
  categories: z
    .array(
      z.object({
        category: z.string(),
        cases: z.array(z.string()).min(1),
      })
    )
    .min(1),
});
export type EdgeCasesOutput = z.infer<typeof edgeCasesOutputSchema>;

export const apiTestsOutputSchema = z.object({
  scenarios: z
    .array(
      z.object({
        name: z.string(),
        category: z.string(),
        expectedStatus: z.union([z.number(), z.string()]),
        description: z.string(),
      })
    )
    .min(1),
  curlCommands: z.array(z.object({ label: z.string(), command: z.string() })),
  assertions: z.array(z.object({ label: z.string(), code: z.string() })),
});
export type ApiTestsOutput = z.infer<typeof apiTestsOutputSchema>;

export const regressionChecklistOutputSchema = z.object({
  items: z
    .array(
      z.object({
        priority: z.enum(["P0", "P1", "P2"]),
        area: z.string(),
        check: z.string(),
      })
    )
    .min(1),
});
export type RegressionChecklistOutput = z.infer<typeof regressionChecklistOutputSchema>;

export const sqlTestsOutputSchema = z.object({
  queries: z
    .array(
      z.object({
        purpose: z.string(),
        query: z.string(),
        explanation: z.string(),
        destructive: z.boolean(),
      })
    )
    .min(1),
});
export type SqlTestsOutput = z.infer<typeof sqlTestsOutputSchema>;

const testDataCell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const testDataOutputSchema = z.object({
  fields: z.array(z.string()).min(1),
  validRows: z.array(z.record(z.string(), testDataCell)).min(1),
  invalidRows: z
    .array(z.object({ row: z.record(z.string(), testDataCell), reason: z.string() }))
    .min(1),
});
export type TestDataOutput = z.infer<typeof testDataOutputSchema>;

export const automationSnippetOutputSchema = z.object({
  framework: z.string(),
  language: z.string(),
  snippet: z.string(),
  notes: z.array(z.string()),
});
export type AutomationSnippetOutput = z.infer<typeof automationSnippetOutputSchema>;

/** Output schema lookup used by the API route. */
export const QA_OUTPUT_SCHEMAS: Record<QaToolId, z.ZodTypeAny> = {
  "test-cases": testCasesOutputSchema,
  "bug-report": bugReportOutputSchema,
  "edge-cases": edgeCasesOutputSchema,
  "api-tests": apiTestsOutputSchema,
  "regression-checklist": regressionChecklistOutputSchema,
  "sql-tests": sqlTestsOutputSchema,
  "test-data": testDataOutputSchema,
  "automation-snippet": automationSnippetOutputSchema,
};
