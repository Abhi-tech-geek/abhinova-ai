import type { QaToolId } from "@/lib/validators/qa";
import type { TestCasesOutput, BugReportOutput, TestDataOutput } from "@/types/qa";

// QA Studio tool registry — client-safe metadata driving the dashboard grid,
// the dynamic tool page, and its form. Prompts stay server-side in
// lib/ai/prompts/qa-tools.ts; output schemas in lib/validators/qa.ts.

export interface QaToolDefinition {
  id: QaToolId;
  name: string;
  icon: string;
  description: string;
  /** Written from a working QA engineer's perspective. */
  proTip: string;
  inputLabel: string;
  inputPlaceholder: string;
  /** A realistic sample input for the "Try an example" button. */
  example: string;
  /** Optional select rendered above the textarea (e.g. framework choice). */
  select?: {
    key: string;
    label: string;
    options: { value: string; label: string }[];
  };
}

export const QA_TOOLS: QaToolDefinition[] = [
  {
    id: "test-cases",
    name: "Test Case Generator",
    icon: "🧪",
    description: "Requirement in, structured positive/negative/edge test cases out.",
    proTip: "Paste the acceptance criteria verbatim — the closer the input is to what the PM wrote, the fewer cases you'll have to fix by hand.",
    inputLabel: "Requirement / user story",
    inputPlaceholder: "As a user, I can reset my password via an emailed link that expires in 30 minutes…",
    example: "As a registered user, I can reset my password from the login page. I enter my email, receive a reset link that expires in 30 minutes, and set a new password (8–64 characters, at least one number and one special character). The link works only once. After 5 reset requests in an hour the form is blocked for 1 hour.",
  },
  {
    id: "bug-report",
    name: "Bug Report Formatter",
    icon: "🐞",
    description: "Rough notes become a report a developer can act on immediately.",
    proTip: "Include what you SAW, not what you think broke — the formatter separates expected vs actual much better from raw observations.",
    inputLabel: "Rough bug notes",
    inputPlaceholder: "login btn does nothing on mobile chrome after wrong otp entered once, works on desktop, saw 500 in network tab…",
    example: "checkout page, android chrome 129 (pixel 7). added 2 items, applied coupon SAVE10, tapped Pay. spinner keeps going ~40s then 'Something went wrong'. card WAS charged (got bank sms) but order not in My Orders. desktop chrome works fine. network tab showed POST /api/orders 504. happened 3 times out of 4.",
  },
  {
    id: "edge-cases",
    name: "Edge Case Generator",
    icon: "⚡",
    description: "Boundary, null, concurrency, locale, network, permission cases you'd find on day 3 — on day 1.",
    proTip: "Mention the tech stack (mobile? offline-capable? multi-user?) — concurrency and network categories get dramatically sharper.",
    inputLabel: "Feature description",
    inputPlaceholder: "A shopping cart that syncs across devices and supports promo codes…",
    example: "A food-delivery cart: users add dishes from one restaurant at a time, apply one promo code, choose a delivery slot, and pay by UPI, card or cash on delivery. The cart syncs between the mobile app and the website, and the app works offline for browsing.",
  },
  {
    id: "api-tests",
    name: "API Testing Helper",
    icon: "🔌",
    description: "Endpoint in — scenarios, curl commands, and Postman assertions out.",
    proTip: "Paste a real sample request/response if you have one; the validation cases will map to your actual fields instead of generic ones.",
    inputLabel: "Endpoint description or sample request",
    inputPlaceholder: "POST /api/orders {items: [{sku, qty}], couponCode?} — requires Bearer token, returns 201 with order id…",
    example: "POST /api/v1/orders — creates an order. Headers: Authorization: Bearer <token> (required). Body: { \"items\": [{ \"sku\": \"string\", \"qty\": 1-10 }], \"couponCode\": \"string, optional\", \"addressId\": \"uuid\" }. Returns 201 { \"orderId\": \"uuid\", \"total\": number }. 400 on validation errors, 401 without token, 409 if an item is out of stock.",
  },
  {
    id: "regression-checklist",
    name: "Regression Checklist",
    icon: "✅",
    description: "What changed + app context = prioritized P0/P1/P2 regression checklist.",
    proTip: "Name the shared components the feature touches (auth, payments, notifications) — blast radius is where regressions hide.",
    inputLabel: "What changed + app context",
    inputPlaceholder: "We changed the checkout address form to autocomplete via Google Places. App: e-commerce with saved addresses, COD and card payments…",
    example: "Change: we moved the checkout address form to Google Places autocomplete and added a 'Save this address' checkbox. App: e-commerce web + mobile app with saved addresses, guest checkout, COD and card/UPI payments, order tracking and email/SMS order confirmations.",
  },
  {
    id: "sql-tests",
    name: "SQL Testing Helper",
    icon: "🗃️",
    description: "Verification queries with explanations. SELECT-only by default; destructive queries clearly flagged.",
    proTip: "Give real column names and one example row — the queries come back copy-paste runnable instead of pseudo-SQL.",
    inputLabel: "Table description + scenario",
    inputPlaceholder: "orders(id, user_id, status, total_cents, created_at). Verify no order is 'paid' with total_cents = 0 and every 'refunded' order has a refund row…",
    example: "Tables: orders(id, user_id, status, total_cents, created_at), payments(id, order_id, status, amount_cents), refunds(id, order_id, amount_cents). Status values: pending, paid, shipped, refunded, cancelled. Verify: no 'paid' order has total_cents = 0, every 'paid' order has exactly one successful payment of the same amount, and every 'refunded' order has a refund row.",
  },
  {
    id: "test-data",
    name: "Test Data Generator",
    icon: "🎲",
    description: "Schema in — realistic valid rows plus invalid rows that each break exactly one rule.",
    proTip: "State the validation rules (max lengths, formats, required fields) — every invalid row will then target a specific rule you can trace.",
    inputLabel: "Schema / fields",
    inputPlaceholder: "user: name (2-50 chars), email (unique), age (18-100), phone (Indian 10-digit), signup_date (not future)…",
    example: "user signup: full_name (2–50 letters and spaces), email (valid, unique), phone (Indian mobile, 10 digits starting 6–9), date_of_birth (age 18–100), city (from: Delhi, Mumbai, Bengaluru, Pune), password (8–64 chars, 1 number, 1 special character).",
  },
  {
    id: "automation-snippet",
    name: "Automation Snippet",
    icon: "🤖",
    description: "Scenario + framework = clean, commented automation code with good locators and waits.",
    proTip: "Mention your locator convention (we use data-testid everywhere in AbhiNova) — snippets will match your codebase style.",
    inputLabel: "Scenario to automate",
    inputPlaceholder: "Login with valid credentials, assert dashboard heading is visible, then log out and assert redirect to /login…",
    example: "Open the login page, log in with a valid email and password, check that the dashboard heading 'Welcome back' is visible, open the profile menu, click Log out, and check the user lands on the login page again.",
    select: {
      key: "framework",
      label: "Framework",
      options: [
        { value: "playwright-ts", label: "Playwright (TypeScript)" },
        { value: "selenium-java", label: "Selenium (Java)" },
        { value: "cypress", label: "Cypress (JavaScript)" },
      ],
    },
  },
];

export function getQaTool(id: string): QaToolDefinition | undefined {
  return QA_TOOLS.find((t) => t.id === id);
}

// ---------------------------------------------------------------------------
// Export helpers (client-side)
// ---------------------------------------------------------------------------

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function testCasesToCsv(data: TestCasesOutput): string {
  return toCsv([
    ["ID", "Title", "Preconditions", "Steps", "Expected Result", "Priority", "Type"],
    ...data.testCases.map((tc) => [
      tc.id,
      tc.title,
      tc.preconditions,
      tc.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
      tc.expectedResult,
      tc.priority,
      tc.type,
    ]),
  ]);
}

export function testCasesToMarkdown(data: TestCasesOutput): string {
  const header = "| ID | Title | Preconditions | Steps | Expected Result | Priority | Type |\n|---|---|---|---|---|---|---|";
  const rows = data.testCases.map((tc) =>
    `| ${tc.id} | ${tc.title} | ${tc.preconditions} | ${tc.steps
      .map((s, i) => `${i + 1}. ${s}`)
      .join("<br>")} | ${tc.expectedResult} | ${tc.priority} | ${tc.type} |`
  );
  return [header, ...rows].join("\n");
}

export function bugReportToMarkdown(data: BugReportOutput): string {
  return [
    `## ${data.title}`,
    ``,
    `**Environment:** ${data.environment}`,
    `**Severity:** ${data.severity} · **Priority:** ${data.priority}`,
    ``,
    `### Steps to Reproduce`,
    ...data.stepsToReproduce.map((s, i) => `${i + 1}. ${s}`),
    ``,
    `### Expected Result`,
    data.expectedResult,
    ``,
    `### Actual Result`,
    data.actualResult,
    ``,
    `### Attachments Checklist`,
    ...data.attachmentsChecklist.map((a) => `- [ ] ${a}`),
  ].join("\n");
}

export function testDataToCsv(data: TestDataOutput): string {
  const cell = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return toCsv([
    data.fields,
    ...data.validRows.map((row) => data.fields.map((f) => cell(row[f] ?? null))),
  ]);
}
