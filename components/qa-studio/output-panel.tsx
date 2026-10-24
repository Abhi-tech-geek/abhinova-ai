"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { ExportButtons } from "@/components/qa-studio/export-buttons";
import {
  testCasesToCsv,
  testCasesToMarkdown,
  bugReportToMarkdown,
  testDataToCsv,
} from "@/lib/qa-tools";
import type {
  QaToolId,
  TestCasesOutput,
  BugReportOutput,
  EdgeCasesOutput,
  ApiTestsOutput,
  RegressionChecklistOutput,
  SqlTestsOutput,
  TestDataOutput,
  AutomationSnippetOutput,
} from "@/types/qa";

function CopyableCode({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="group relative">
      {label && <p className="mb-1 text-xs font-medium">{label}</p>}
      <pre className="overflow-x-auto rounded-md border border-border bg-background/60 p-3 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 rounded-md border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        data-testid="qastudio-output-copy-code"
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-border px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-border/50 px-2 py-2 align-top text-xs">{children}</td>;
}

const priorityColor: Record<string, string> = {
  High: "bg-destructive/15 text-destructive",
  Medium: "bg-warning/15 text-warning",
  Low: "bg-success/15 text-success",
  P0: "bg-destructive/15 text-destructive",
  P1: "bg-warning/15 text-warning",
  P2: "bg-success/15 text-success",
};

function Pill({ value }: { value: string }) {
  return (
    <Badge variant="outline" className={`border-0 text-[10px] ${priorityColor[value] ?? "bg-secondary"}`}>
      {value}
    </Badge>
  );
}

// ---------------------------------------------------------------------------

function TestCasesView({ data }: { data: TestCasesOutput }) {
  return (
    <div className="space-y-3">
      <ExportButtons
        toolId="test-cases"
        csv={() => testCasesToCsv(data)}
        markdown={() => testCasesToMarkdown(data)}
        json={() => JSON.stringify(data, null, 2)}
      />
      {/* Phones: one card per case — a 7-column table is unreadable at 375px. */}
      <ul className="space-y-2 sm:hidden" data-testid="qastudio-testcases-cards">
        {data.testCases.map((tc) => (
          <li key={tc.id} className="rounded-md border border-border/60 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[11px] text-muted-foreground">{tc.id}</span>
              <Pill value={tc.priority} />
              <Pill value={tc.type} />
            </div>
            <p className="mt-1.5 text-sm font-medium">{tc.title}</p>
            {tc.preconditions && (
              <p className="mt-1.5 text-muted-foreground">
                <span className="font-medium text-foreground">Pre: </span>
                {tc.preconditions}
              </p>
            )}
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
              {tc.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            <p className="mt-1.5 rounded bg-success/10 px-2 py-1">
              <span className="font-medium text-success">Expected: </span>
              {tc.expectedResult}
            </p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>ID</Th><Th>Title</Th><Th>Preconditions</Th><Th>Steps</Th>
              <Th>Expected</Th><Th>Priority</Th><Th>Type</Th>
            </tr>
          </thead>
          <tbody>
            {data.testCases.map((tc) => (
              <tr key={tc.id}>
                <Td>{tc.id}</Td>
                <Td>{tc.title}</Td>
                <Td>{tc.preconditions}</Td>
                <Td>
                  <ol className="list-decimal space-y-0.5 pl-4">
                    {tc.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                </Td>
                <Td>{tc.expectedResult}</Td>
                <Td><Pill value={tc.priority} /></Td>
                <Td><Pill value={tc.type} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BugReportView({ data }: { data: BugReportOutput }) {
  return (
    <div className="space-y-4">
      <ExportButtons
        toolId="bug-report"
        markdown={() => bugReportToMarkdown(data)}
        json={() => JSON.stringify(data, null, 2)}
      />
      <div className="space-y-3 text-sm">
        <h3 className="font-display text-base font-semibold">{data.title}</h3>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Environment:</span> {data.environment}
        </p>
        <div className="flex gap-2">
          <Pill value={data.severity} /> <Pill value={data.priority} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Steps to reproduce</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-xs">
            {data.stepsToReproduce.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-success/30 bg-success/5 p-3">
            <p className="text-[11px] font-semibold uppercase text-success">Expected</p>
            <p className="mt-1 text-xs">{data.expectedResult}</p>
          </div>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-[11px] font-semibold uppercase text-destructive">Actual</p>
            <p className="mt-1 text-xs">{data.actualResult}</p>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attach before filing</p>
          <ul className="mt-1 space-y-1 text-xs">
            {data.attachmentsChecklist.map((a, i) => (
              <li key={i}>☐ {a}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function EdgeCasesView({ data }: { data: EdgeCasesOutput }) {
  return (
    <div className="space-y-4">
      <ExportButtons toolId="edge-cases" json={() => JSON.stringify(data, null, 2)} />
      {data.categories.map((cat) => (
        <div key={cat.category}>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-accent">{cat.category}</h4>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs">
            {cat.cases.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ApiTestsView({ data }: { data: ApiTestsOutput }) {
  return (
    <div className="space-y-5">
      <ExportButtons toolId="api-tests" json={() => JSON.stringify(data, null, 2)} />
      <ul className="space-y-2 sm:hidden" data-testid="qastudio-apitests-cards">
        {data.scenarios.map((s, i) => (
          <li key={i} className="rounded-md border border-border/60 p-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <Pill value={s.category} />
              <code className="font-mono text-[11px]">{String(s.expectedStatus)}</code>
            </div>
            <p className="mt-1.5 text-sm font-medium">{s.name}</p>
            <p className="mt-1 text-muted-foreground">{s.description}</p>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse">
          <thead>
            <tr><Th>Scenario</Th><Th>Category</Th><Th>Status</Th><Th>Description</Th></tr>
          </thead>
          <tbody>
            {data.scenarios.map((s, i) => (
              <tr key={i}>
                <Td>{s.name}</Td>
                <Td><Pill value={s.category} /></Td>
                <Td><code className="font-mono text-xs">{String(s.expectedStatus)}</code></Td>
                <Td>{s.description}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.curlCommands.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">curl commands</h4>
          {data.curlCommands.map((c, i) => <CopyableCode key={i} label={c.label} code={c.command} />)}
        </div>
      )}
      {data.assertions.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Postman assertions</h4>
          {data.assertions.map((a, i) => <CopyableCode key={i} label={a.label} code={a.code} />)}
        </div>
      )}
    </div>
  );
}

function RegressionView({ data }: { data: RegressionChecklistOutput }) {
  const order = { P0: 0, P1: 1, P2: 2 } as const;
  const items = [...data.items].sort((a, b) => order[a.priority] - order[b.priority]);
  return (
    <div className="space-y-3">
      <ExportButtons toolId="regression-checklist" json={() => JSON.stringify(data, null, 2)} />
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 rounded-md border border-border/50 px-3 py-2 text-xs">
            <Pill value={item.priority} />
            <span className="font-medium text-muted-foreground">{item.area}:</span>
            <span>{item.check}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SqlTestsView({ data }: { data: SqlTestsOutput }) {
  return (
    <div className="space-y-4">
      <ExportButtons toolId="sql-tests" json={() => JSON.stringify(data, null, 2)} />
      {data.queries.map((q, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium">{q.purpose}</p>
            {q.destructive && (
              <Badge variant="outline" className="border-destructive/50 bg-destructive/10 text-[10px] text-destructive">
                ⚠ DESTRUCTIVE — review before running
              </Badge>
            )}
          </div>
          <CopyableCode code={q.query} />
          <p className="text-xs text-muted-foreground">{q.explanation}</p>
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground/70">
        Nothing here is ever executed automatically — copy, review, run yourself.
      </p>
    </div>
  );
}

function TestDataView({ data }: { data: TestDataOutput }) {
  const cell = (v: unknown) =>
    v === null || v === undefined ? (
      <span className="text-muted-foreground/50">null</span>
    ) : (
      String(v)
    );
  return (
    <div className="space-y-5">
      <ExportButtons
        toolId="test-data"
        csv={() => testDataToCsv(data)}
        json={() => JSON.stringify(data, null, 2)}
      />
      <div>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-success">Valid rows</h4>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr>{data.fields.map((f) => <Th key={f}>{f}</Th>)}</tr></thead>
            <tbody>
              {data.validRows.map((row, i) => (
                <tr key={i}>{data.fields.map((f) => <Td key={f}>{cell(row[f] ?? null)}</Td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-destructive">Invalid rows</h4>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>{data.fields.map((f) => <Th key={f}>{f}</Th>)}<Th>Why invalid</Th></tr>
            </thead>
            <tbody>
              {data.invalidRows.map((item, i) => (
                <tr key={i}>
                  {data.fields.map((f) => <Td key={f}>{cell(item.row[f] ?? null)}</Td>)}
                  <Td><span className="text-destructive">{item.reason}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AutomationView({ data }: { data: AutomationSnippetOutput }) {
  return (
    <div className="space-y-3">
      <ExportButtons toolId="automation-snippet" json={() => JSON.stringify(data, null, 2)} />
      <div className="flex gap-2">
        <Pill value={data.framework} /> <Pill value={data.language} />
      </div>
      <CopyableCode code={data.snippet} />
      {data.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {data.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function OutputPanel({ toolId, data }: { toolId: QaToolId; data: unknown }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="glass rounded-lg p-5"
      data-testid={`qastudio-${toolId}-output`}
    >
      {toolId === "test-cases" && <TestCasesView data={data as TestCasesOutput} />}
      {toolId === "bug-report" && <BugReportView data={data as BugReportOutput} />}
      {toolId === "edge-cases" && <EdgeCasesView data={data as EdgeCasesOutput} />}
      {toolId === "api-tests" && <ApiTestsView data={data as ApiTestsOutput} />}
      {toolId === "regression-checklist" && <RegressionView data={data as RegressionChecklistOutput} />}
      {toolId === "sql-tests" && <SqlTestsView data={data as SqlTestsOutput} />}
      {toolId === "test-data" && <TestDataView data={data as TestDataOutput} />}
      {toolId === "automation-snippet" && <AutomationView data={data as AutomationSnippetOutput} />}
    </motion.div>
  );
}
