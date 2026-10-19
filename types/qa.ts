// Shared QA Studio types — inferred from the zod schemas in lib/validators/qa
// so the schema is the single source of truth.
export type {
  QaToolId,
  QaRequest,
  TestCasesOutput,
  BugReportOutput,
  EdgeCasesOutput,
  ApiTestsOutput,
  RegressionChecklistOutput,
  SqlTestsOutput,
  TestDataOutput,
  AutomationSnippetOutput,
} from "@/lib/validators/qa";

/** qa_artifacts table row as used by the UI. */
export interface QaArtifactRecord {
  id: string;
  type: string;
  input: string;
  output: string; // JSON string of the tool's output schema
  created_at: string;
}
